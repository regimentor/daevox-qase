import { InMemoryCache, type FieldFunctionOptions, type Reference } from '@apollo/client';

interface OffsetConnection {
  items: Reference[];
  pageInfo: { limit: number; offset: number; total: number };
}

export function mergeOffsetConnection(
  existing: OffsetConnection | undefined,
  incoming: OffsetConnection,
  options: Pick<FieldFunctionOptions, 'args'>,
): OffsetConnection {
  const offset = (options.args?.page as { offset?: number } | undefined)?.offset ?? 0;
  const items = existing ? existing.items.slice() : [];
  for (const [index, item] of incoming.items.entries()) items[offset + index] = item;
  return { ...incoming, items };
}

export function readOffsetConnection(
  existing: OffsetConnection | undefined,
  options: Pick<FieldFunctionOptions, 'args'>,
) {
  if (!existing) return undefined;
  const page = options.args?.page as { offset?: number; limit?: number } | undefined;
  const offset = page?.offset ?? 0;
  const limit = page?.limit ?? 50;
  const items = existing.items.slice(offset, offset + limit).filter(Boolean);
  return items.length || offset === 0 ? { ...existing, items } : undefined;
}

const paginated = (keyArgs: string[]) => ({
  keyArgs,
  merge: mergeOffsetConnection,
  read: readOffsetConnection,
});

export function createApolloCache() {
  return new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          workspaces: paginated([]),
          workspaceMembers: paginated(['workspaceId']),
          projects: paginated(['workspaceId']),
          testCases: paginated(['projectId', 'filter', 'sort']),
          testPlans: paginated(['projectId']),
          environments: paginated(['projectId']),
          testRuns: paginated(['projectId', 'status']),
          testResults: paginated(['runCaseId']),
        },
      },
    },
  });
}
