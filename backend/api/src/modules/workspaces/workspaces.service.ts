import { Injectable } from '@nestjs/common';
import { Prisma, WorkspaceRole } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, page, text } from '../../common/validation.js';
import { withTransactionRetry } from '../../common/transaction-retry.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { TenantService } from './tenant.service.js';

@Injectable()
export class WorkspacesService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  public me(userId: string) {
    return this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
  }

  public async list(
    userId: string,
    pagination?: { limit?: number | null; offset?: number | null } | null,
  ) {
    const { limit, offset } = page(pagination);
    const where = { members: { some: { userId } } };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.workspace.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.client.workspace.count({ where }),
    ]);
    return { items, pageInfo: { limit, offset, total } };
  }

  public get(userId: string, id: string) {
    return this.tenant.workspace(userId, id);
  }

  public async members(
    userId: string,
    workspaceId: string,
    pagination?: { limit?: number | null; offset?: number | null } | null,
  ) {
    await this.tenant.workspace(userId, workspaceId);
    const { limit, offset } = page(pagination);
    const where = { workspaceId };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.workspaceMember.findMany({
        where,
        include: { user: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.client.workspaceMember.count({ where }),
    ]);
    return { items, pageInfo: { limit, offset, total } };
  }

  public create(userId: string, nameInput: string) {
    const name = text(nameInput, 'name', limits.name);
    return this.prisma.client.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.create({ data: { name, createdBy: userId } });
      await transaction.workspaceMember.create({
        data: { workspaceId: workspace.id, userId, role: WorkspaceRole.ADMIN },
      });
      return workspace;
    });
  }

  public async update(userId: string, id: string, nameInput: string) {
    await this.tenant.workspace(userId, id, WorkspaceRole.ADMIN);
    return this.prisma.client.workspace.update({
      where: { id },
      data: { name: text(nameInput, 'name', limits.name) },
    });
  }

  public async delete(
    userId: string,
    workspaceId: string,
    confirmationName: string,
  ): Promise<boolean> {
    const workspace = await this.tenant.workspace(userId, workspaceId, WorkspaceRole.ADMIN);
    invariant(
      workspace.name === confirmationName,
      'VALIDATION_ERROR',
      'Request validation failed',
      {
        confirmationName: 'Confirmation name does not match',
      },
    );
    await this.prisma.client.$transaction(async (transaction) => {
      const attachments = await transaction.attachment.findMany({
        where: { workspaceId },
        select: { id: true, storageKey: true },
      });
      if (attachments.length) {
        await transaction.objectDeletion.createMany({
          data: attachments.map((attachment) => ({
            attachmentId: attachment.id,
            storageKey: attachment.storageKey,
          })),
        });
      }
      await transaction.workspace.delete({ where: { id: workspace.id } });
    });
    return true;
  }

  public async addMember(
    userId: string,
    workspaceId: string,
    emailInput: string,
    role: WorkspaceRole,
  ) {
    await this.tenant.workspace(userId, workspaceId, WorkspaceRole.ADMIN);
    const email = emailInput.trim().toLowerCase();
    const target = await this.prisma.client.user.findUnique({ where: { email } });
    if (!target) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    try {
      return await this.prisma.client.workspaceMember.create({
        data: { workspaceId, userId: target.id, role },
        include: { user: true },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('WORKSPACE_MEMBER_ALREADY_EXISTS', 'Workspace member already exists');
      }
      throw error;
    }
  }

  public updateMember(actorId: string, workspaceId: string, userId: string, role: WorkspaceRole) {
    return this.mutateMember(actorId, workspaceId, userId, role);
  }

  public async removeMember(
    actorId: string,
    workspaceId: string,
    userId: string,
  ): Promise<boolean> {
    await this.mutateMember(actorId, workspaceId, userId, null);
    return true;
  }

  private async mutateMember(
    actorId: string,
    workspaceId: string,
    userId: string,
    role: WorkspaceRole | null,
  ) {
    return withTransactionRetry(() =>
      this.prisma.client.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
          await this.tenant.workspace(actorId, workspaceId, WorkspaceRole.ADMIN, transaction);
          const member = await transaction.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
            include: { user: true },
          });
          if (!member) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
          if (member.role === WorkspaceRole.ADMIN && role !== WorkspaceRole.ADMIN) {
            const admins = await transaction.workspaceMember.count({
              where: { workspaceId, role: WorkspaceRole.ADMIN },
            });
            if (admins <= 1)
              throw new AppError('LAST_ADMIN_REQUIRED', 'Workspace must retain at least one admin');
          }
          if (role === null) {
            await transaction.workspaceMember.delete({ where: { id: member.id } });
            return member;
          }
          return transaction.workspaceMember.update({
            where: { id: member.id },
            data: { role },
            include: { user: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }
}
