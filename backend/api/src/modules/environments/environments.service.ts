import { Injectable } from '@nestjs/common';
import { Prisma } from '@app/storage';

import { invariant } from '../../common/errors.js';
import { limits, optionalText, page, text } from '../../common/validation.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type { UpdateEnvironmentInput } from '../../generated/graphql.js';
import { TenantService } from '../workspaces/tenant.service.js';
import { AppError } from '../../common/errors.js';

@Injectable()
export class EnvironmentsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  public async list(
    userId: string,
    projectId: string,
    pagination?: { limit?: number | null; offset?: number | null } | null,
  ) {
    await this.tenant.project(userId, projectId);
    const { limit, offset } = page(pagination);
    const where = { projectId };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.environment.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.client.environment.count({ where }),
    ]);
    return { items, pageInfo: { limit, offset, total } };
  }

  public async create(
    userId: string,
    projectId: string,
    nameInput: string,
    description: string | null | undefined,
  ) {
    await this.tenant.project(userId, projectId, true);
    try {
      return await this.prisma.client.environment.create({
        data: {
          projectId,
          name: text(nameInput, 'name', limits.name),
          description: optionalText(description, 'description'),
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError('CONFLICT', 'Environment name already exists');
      throw error;
    }
  }

  public async update(userId: string, id: string, input: UpdateEnvironmentInput) {
    const environment = await this.authorized(userId, id);
    await this.tenant.project(userId, environment.projectId, true);
    const data: Prisma.EnvironmentUpdateInput = {};
    if (input.name !== undefined && input.name !== null)
      data.name = text(input.name, 'name', limits.name);
    if (input.description !== undefined)
      data.description = optionalText(input.description, 'description');
    return this.prisma.client.environment.update({ where: { id }, data });
  }

  public async delete(userId: string, id: string): Promise<boolean> {
    const environment = await this.authorized(userId, id);
    await this.tenant.project(userId, environment.projectId, true);
    const used = await this.prisma.client.testRun.count({ where: { environmentId: id } });
    invariant(used === 0, 'CONFLICT', 'Environment used by a run cannot be deleted');
    await this.prisma.client.environment.delete({ where: { id } });
    return true;
  }

  private async authorized(userId: string, id: string) {
    const environment = await this.prisma.client.environment.findFirst({
      where: { id, project: { workspace: { members: { some: { userId } } } } },
    });
    if (!environment) throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
    return environment;
  }
}
