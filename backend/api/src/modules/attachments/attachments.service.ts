import { Inject, Injectable } from '@nestjs/common';
import { AttachmentStatus, WorkspaceRole } from '@app/storage';
import { randomUUID } from 'node:crypto';

import { APP_CONFIG, type AppConfig } from '../../common/config.js';
import { AppError, invariant } from '../../common/errors.js';
import { limits, text } from '../../common/validation.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../../infrastructure/object-storage/object-storage.js';
import { TenantService } from '../workspaces/tenant.service.js';

const uploadExpiresSeconds = 300;
const downloadExpiresSeconds = 300;
const forbiddenMime =
  /(?:text\/html|image\/svg\+xml|application\/(?:x-msdownload|x-executable|x-sh|x-dosexec))/i;

@Injectable()
export class AttachmentsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  public async presign(
    userId: string,
    workspaceId: string,
    filenameInput: string,
    mimeTypeInput: string,
    size: bigint,
  ) {
    await this.tenant.workspace(userId, workspaceId);
    const filename = text(filenameInput, 'filename', limits.title);
    const mimeType = mimeTypeInput.trim().toLowerCase();
    invariant(
      size > 0n && size <= BigInt(this.config.attachmentMaxBytes),
      'VALIDATION_ERROR',
      'Request validation failed',
      { size: `Attachment must be between 1 and ${this.config.attachmentMaxBytes} bytes` },
    );
    invariant(
      this.config.attachmentAllowedMimeTypes.has(mimeType) && !forbiddenMime.test(mimeType),
      'VALIDATION_ERROR',
      'Request validation failed',
      { mimeType: 'MIME type is not allowed' },
    );
    const storageKey = `workspace/${workspaceId}/${randomUUID()}`;
    const attachment = await this.prisma.client.attachment.create({
      data: { workspaceId, uploadedBy: userId, storageKey, filename, mimeType, size },
    });
    try {
      const url = await this.storage.presignPut(storageKey, mimeType, size, uploadExpiresSeconds);
      return {
        attachment,
        url,
        method: 'PUT',
        headers: [
          { name: 'content-type', value: mimeType },
          { name: 'content-length', value: size.toString() },
        ],
        expiresAt: new Date(Date.now() + uploadExpiresSeconds * 1000),
      };
    } catch (error: unknown) {
      await this.prisma.client.attachment.delete({ where: { id: attachment.id } });
      throw error;
    }
  }

  public async complete(userId: string, id: string) {
    const attachment = await this.authorized(userId, id);
    if (attachment.status === AttachmentStatus.READY) return attachment;
    let metadata: { size: bigint; contentType: string | undefined };
    try {
      metadata = await this.storage.head(attachment.storageKey);
    } catch {
      throw new AppError(
        'ATTACHMENT_METADATA_MISMATCH',
        'Uploaded object metadata could not be verified',
      );
    }
    if (
      metadata.size !== attachment.size ||
      metadata.contentType?.toLowerCase() !== attachment.mimeType.toLowerCase()
    ) {
      throw new AppError(
        'ATTACHMENT_METADATA_MISMATCH',
        'Uploaded object metadata does not match the request',
      );
    }
    return this.prisma.client.attachment.update({
      where: { id },
      data: { status: AttachmentStatus.READY },
    });
  }

  public async downloadUrl(userId: string, id: string): Promise<string | null> {
    const attachment = await this.authorized(userId, id);
    if (attachment.status !== AttachmentStatus.READY) return null;
    return this.storage.presignGet(
      attachment.storageKey,
      attachment.filename,
      downloadExpiresSeconds,
    );
  }

  public async delete(userId: string, id: string): Promise<boolean> {
    const attachment = await this.authorized(userId, id);
    const member = await this.prisma.client.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: attachment.workspaceId, userId } },
    });
    invariant(
      attachment.uploadedBy === userId || member?.role === WorkspaceRole.ADMIN,
      'FORBIDDEN',
      'Only the uploader or a workspace admin may delete this attachment',
    );
    const links = await this.prisma.client.testResultAttachment.count({
      where: { attachmentId: id },
    });
    invariant(links === 0, 'CONFLICT', 'Attachment linked to a result cannot be deleted');
    const deletion = await this.prisma.client.$transaction(async (transaction) => {
      const outbox = await transaction.objectDeletion.create({
        data: { attachmentId: id, storageKey: attachment.storageKey },
      });
      await transaction.attachment.delete({ where: { id } });
      return outbox;
    });
    try {
      await this.storage.delete(attachment.storageKey);
      await this.prisma.client.objectDeletion.delete({ where: { id: deletion.id } });
    } catch (error: unknown) {
      await this.prisma.client.objectDeletion.update({
        where: { id: deletion.id },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.name : 'ObjectStorageError',
          nextAttemptAt: new Date(Date.now() + 60_000),
        },
      });
    }
    return true;
  }

  public async cleanupPending(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.client.attachment.findMany({
      where: { status: AttachmentStatus.PENDING, createdAt: { lt: cutoff } },
      take: 100,
    });
    let removed = 0;
    for (const attachment of rows) {
      try {
        await this.storage.delete(attachment.storageKey);
        await this.prisma.client.attachment.delete({ where: { id: attachment.id } });
        removed += 1;
      } catch {
        // A later invocation retries the still-present metadata.
      }
    }
    const outbox = await this.prisma.client.objectDeletion.findMany({
      where: { nextAttemptAt: { lte: new Date() } },
      take: 100,
    });
    for (const deletion of outbox) {
      try {
        await this.storage.delete(deletion.storageKey);
        await this.prisma.client.objectDeletion.delete({ where: { id: deletion.id } });
      } catch (error: unknown) {
        await this.prisma.client.objectDeletion.update({
          where: { id: deletion.id },
          data: {
            attempts: { increment: 1 },
            lastError: error instanceof Error ? error.name : 'ObjectStorageError',
            nextAttemptAt: new Date(
              Date.now() + Math.min(3_600_000, 2 ** deletion.attempts * 60_000),
            ),
          },
        });
      }
    }
    return removed;
  }

  private async authorized(userId: string, id: string) {
    const attachment = await this.prisma.client.attachment.findFirst({
      where: { id, workspace: { members: { some: { userId } } } },
    });
    if (!attachment) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    return attachment;
  }
}
