import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { AppError, invariant } from '../../common/errors.js';
import { limits, optionalText, page, text } from '../../common/validation.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type { UpdateProjectInput } from '../../generated/graphql.js';
import { TenantService } from '../workspaces/tenant.service.js';

function code(value: string): string {
  const normalized = value.trim().toUpperCase();
  invariant(
    /^[A-Z][A-Z0-9_]{1,31}$/.test(normalized),
    'VALIDATION_ERROR',
    'Request validation failed',
    {
      code: 'Code must match ^[A-Z][A-Z0-9_]{1,31}$',
    },
  );
  return normalized;
}

@Injectable()
export class ProjectsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  public async list(
    userId: string,
    workspaceId: string,
    pagination?: { limit?: number | null; offset?: number | null } | null,
  ) {
    await this.tenant.workspace(userId, workspaceId);
    const { limit, offset } = page(pagination);
    const where = { workspaceId };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.project.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.client.project.count({ where }),
    ]);
    return { items, pageInfo: { limit, offset, total } };
  }

  public get(userId: string, id: string) {
    return this.tenant.project(userId, id);
  }

  public async create(
    userId: string,
    workspaceId: string,
    nameInput: string,
    codeInput: string,
    description?: string | null,
  ) {
    await this.tenant.workspace(userId, workspaceId);
    try {
      return await this.prisma.client.project.create({
        data: {
          workspaceId,
          name: text(nameInput, 'name', limits.name),
          code: code(codeInput),
          description: optionalText(description, 'description'),
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('PROJECT_CODE_ALREADY_EXISTS', 'Project code already exists');
      }
      throw error;
    }
  }

  public async update(userId: string, id: string, input: UpdateProjectInput) {
    await this.tenant.project(userId, id, true);
    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined && input.name !== null)
      data.name = text(input.name, 'name', limits.name);
    if (input.code !== undefined && input.code !== null) data.code = code(input.code);
    if (input.description !== undefined)
      data.description = optionalText(input.description, 'description');
    try {
      return await this.prisma.client.project.update({ where: { id }, data });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('PROJECT_CODE_ALREADY_EXISTS', 'Project code already exists');
      }
      throw error;
    }
  }

  public async archive(userId: string, id: string) {
    const project = await this.tenant.project(userId, id);
    if (project.archivedAt) return project;
    return this.prisma.client.project.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  public async delete(userId: string, id: string): Promise<boolean> {
    await this.tenant.project(userId, id);
    const history = await this.prisma.client.testRun.count({ where: { projectId: id } });
    invariant(history === 0, 'CONFLICT', 'Project with run history cannot be deleted');
    await this.prisma.client.project.delete({ where: { id } });
    return true;
  }
}
