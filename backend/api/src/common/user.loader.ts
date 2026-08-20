import type { User } from '@app/storage';
import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';

import { PrismaService } from '../infrastructure/prisma.service.js';

@Injectable({ scope: Scope.REQUEST })
export class UserLoader {
  private readonly loader: DataLoader<string, User>;

  public constructor(prisma: PrismaService) {
    this.loader = new DataLoader(async (ids) => {
      const rows = await prisma.client.user.findMany({ where: { id: { in: [...ids] } } });
      const byId = new Map(rows.map((user) => [user.id, user]));
      return ids.map((id) => byId.get(id) ?? new Error('User not found'));
    });
  }

  public load(id: string): Promise<User> {
    return this.loader.load(id);
  }
}
