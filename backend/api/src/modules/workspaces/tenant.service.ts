import { Injectable } from '@nestjs/common';
import type { Prisma, WorkspaceRole } from '@app/storage';

import { AppError } from '../../common/errors.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';

@Injectable()
export class TenantService {
  public constructor(private readonly prisma: PrismaService) {}

  public async workspace(
    userId: string,
    workspaceId: string,
    role?: WorkspaceRole,
    transaction?: Prisma.TransactionClient,
  ) {
    const client = transaction ?? this.prisma.client;
    const workspace = await client.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId } },
      },
      include: { members: { where: { userId }, select: { role: true } } },
    });
    if (!workspace) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    if (role && workspace.members[0]?.role !== role)
      throw new AppError('FORBIDDEN', 'Insufficient workspace permissions');
    return workspace;
  }

  public async project(
    userId: string,
    projectId: string,
    writable = false,
    transaction?: Prisma.TransactionClient,
  ) {
    const client = transaction ?? this.prisma.client;
    const project = await client.project.findFirst({
      where: { id: projectId, workspace: { members: { some: { userId } } } },
    });
    if (!project) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    if (writable && project.archivedAt)
      throw new AppError('PROJECT_ARCHIVED', 'Project is archived');
    return project;
  }

  public async member(
    workspaceId: string,
    userId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = transaction ?? this.prisma.client;
    const exists = await client.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!exists)
      throw new AppError('VALIDATION_ERROR', 'Request validation failed', {
        assigneeId: 'User is not a workspace member',
      });
  }
}
