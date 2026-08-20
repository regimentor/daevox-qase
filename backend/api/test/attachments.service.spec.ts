import { AttachmentStatus, WorkspaceRole } from '@app/storage';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../src/common/config.js';
import { AppError } from '../src/common/errors.js';
import type { ObjectStorage } from '../src/infrastructure/object-storage/object-storage.js';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { AttachmentsService } from '../src/modules/attachments/attachments.service.js';
import type { TenantService } from '../src/modules/workspaces/tenant.service.js';

const config = {
  attachmentMaxBytes: 100,
  attachmentAllowedMimeTypes: new Set(['text/plain', 'image/svg+xml']),
} as AppConfig;

const pendingAttachment = {
  id: 'attachment-1',
  workspaceId: 'workspace-1',
  uploadedBy: 'user-1',
  storageKey: 'workspace/workspace-1/object-1',
  filename: 'evidence.txt',
  mimeType: 'text/plain',
  size: 8n,
  status: AttachmentStatus.PENDING,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function storageMock(): ObjectStorage {
  return {
    presignPut: vi.fn().mockResolvedValue('https://storage.example/put'),
    presignGet: vi.fn().mockResolvedValue('https://storage.example/get'),
    head: vi.fn().mockResolvedValue({ size: 8n, contentType: 'text/plain' }),
    delete: vi.fn().mockResolvedValue(undefined),
    ready: vi.fn().mockResolvedValue(undefined),
  };
}

function serviceWith(client: object, storage = storageMock()) {
  const tenant = { workspace: vi.fn().mockResolvedValue({ id: 'workspace-1' }) };
  return {
    service: new AttachmentsService(
      { client } as unknown as PrismaService,
      tenant as unknown as TenantService,
      config,
      storage,
    ),
    storage,
    tenant,
  };
}

describe('AttachmentsService failure contracts', () => {
  it('validates size and MIME before creating metadata', async () => {
    const create = vi.fn();
    const { service } = serviceWith({ attachment: { create } });
    await expect(
      service.presign('user-1', 'workspace-1', 'a.txt', 'text/plain', 0n),
    ).rejects.toThrow(AppError);
    await expect(
      service.presign('user-1', 'workspace-1', 'a.svg', 'image/svg+xml', 8n),
    ).rejects.toThrow(AppError);
    await expect(
      service.presign('user-1', 'workspace-1', 'a.txt', 'application/pdf', 8n),
    ).rejects.toThrow(AppError);
    expect(create).not.toHaveBeenCalled();
  });

  it('rolls metadata back when presigning fails', async () => {
    const remove = vi.fn().mockResolvedValue(pendingAttachment);
    const storage = storageMock();
    vi.mocked(storage.presignPut).mockRejectedValue(new Error('S3 unavailable'));
    const { service } = serviceWith(
      {
        attachment: {
          create: vi.fn().mockResolvedValue(pendingAttachment),
          delete: remove,
        },
      },
      storage,
    );
    await expect(
      service.presign('user-1', 'workspace-1', ' evidence.txt ', ' TEXT/PLAIN ', 8n),
    ).rejects.toThrow('S3 unavailable');
    expect(remove).toHaveBeenCalledWith({ where: { id: pendingAttachment.id } });
  });

  it('rejects missing or mismatched objects and handles READY downloads idempotently', async () => {
    const findFirst = vi.fn().mockResolvedValue(pendingAttachment);
    const update = vi
      .fn()
      .mockResolvedValue({ ...pendingAttachment, status: AttachmentStatus.READY });
    const storage = storageMock();
    const { service } = serviceWith({ attachment: { findFirst, update } }, storage);

    vi.mocked(storage.head).mockRejectedValueOnce(new Error('not found'));
    await expect(service.complete('user-1', pendingAttachment.id)).rejects.toMatchObject({
      code: 'ATTACHMENT_METADATA_MISMATCH',
    });
    vi.mocked(storage.head).mockResolvedValueOnce({ size: 9n, contentType: 'text/plain' });
    await expect(service.complete('user-1', pendingAttachment.id)).rejects.toMatchObject({
      code: 'ATTACHMENT_METADATA_MISMATCH',
    });
    vi.mocked(storage.head).mockResolvedValueOnce({ size: 8n, contentType: 'TEXT/PLAIN' });
    await expect(service.complete('user-1', pendingAttachment.id)).resolves.toMatchObject({
      status: AttachmentStatus.READY,
    });

    await expect(service.downloadUrl('user-1', pendingAttachment.id)).resolves.toBeNull();
    findFirst.mockResolvedValue({ ...pendingAttachment, status: AttachmentStatus.READY });
    await expect(service.complete('user-1', pendingAttachment.id)).resolves.toMatchObject({
      status: AttachmentStatus.READY,
    });
    await expect(service.downloadUrl('user-1', pendingAttachment.id)).resolves.toBe(
      'https://storage.example/get',
    );
  });

  it('enforces deletion ownership and result-link protection', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ ...pendingAttachment, uploadedBy: 'someone-else' });
    const findUnique = vi.fn().mockResolvedValue({ role: WorkspaceRole.MEMBER });
    const count = vi.fn().mockResolvedValue(0);
    const { service } = serviceWith({
      attachment: { findFirst },
      workspaceMember: { findUnique },
      testResultAttachment: { count },
    });
    await expect(service.delete('user-1', pendingAttachment.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    findUnique.mockResolvedValue({ role: WorkspaceRole.ADMIN });
    count.mockResolvedValue(1);
    await expect(service.delete('user-1', pendingAttachment.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    findFirst.mockResolvedValue(null);
    await expect(service.downloadUrl('user-1', 'missing')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('retries pending metadata and deletion outbox entries independently', async () => {
    const pendingRows = [
      pendingAttachment,
      { ...pendingAttachment, id: 'attachment-2', storageKey: 'object-2' },
    ];
    const deletionRows = [
      { id: 'deletion-1', storageKey: 'deleted-1', attempts: 0 },
      { id: 'deletion-2', storageKey: 'deleted-2', attempts: 2 },
    ];
    const attachmentDelete = vi.fn().mockResolvedValue(pendingAttachment);
    const outboxDelete = vi.fn().mockResolvedValue(deletionRows[0]);
    const outboxUpdate = vi.fn().mockResolvedValue(deletionRows[1]);
    const storage = storageMock();
    vi.mocked(storage.delete).mockImplementation(async (key) => {
      if (key === 'object-2' || key === 'deleted-2') throw 'offline';
    });
    const { service } = serviceWith(
      {
        attachment: { findMany: vi.fn().mockResolvedValue(pendingRows), delete: attachmentDelete },
        objectDeletion: {
          findMany: vi.fn().mockResolvedValue(deletionRows),
          delete: outboxDelete,
          update: outboxUpdate,
        },
      },
      storage,
    );

    await expect(service.cleanupPending()).resolves.toBe(1);
    expect(attachmentDelete).toHaveBeenCalledOnce();
    expect(outboxDelete).toHaveBeenCalledOnce();
    expect(outboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deletion-2' },
        data: expect.objectContaining({ lastError: 'ObjectStorageError' }),
      }),
    );
  });
});
