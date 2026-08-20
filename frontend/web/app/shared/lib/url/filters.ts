import {
  SortDirection,
  TestCaseSortField,
  type AutomationStatus,
  type TestCasePriority,
  type TestCaseSeverity,
  type TestCaseType,
} from '@/shared/api/graphql';

export interface RepositoryFilters {
  search: string;
  suiteId?: string;
  priority?: TestCasePriority;
  severity?: TestCaseSeverity;
  type?: TestCaseType;
  automationStatus?: AutomationStatus;
  assigneeId?: string;
  tagId?: string;
  includeArchived: boolean;
  sortField: TestCaseSortField;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export function parseRepositoryFilters(params: URLSearchParams): RepositoryFilters {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  return {
    search: params.get('q') ?? '',
    suiteId: params.get('suite') ?? undefined,
    priority: (params.get('priority') as TestCasePriority | null) ?? undefined,
    severity: (params.get('severity') as TestCaseSeverity | null) ?? undefined,
    type: (params.get('type') as TestCaseType | null) ?? undefined,
    automationStatus: (params.get('automation') as AutomationStatus | null) ?? undefined,
    assigneeId: params.get('assignee') ?? undefined,
    tagId: params.get('tag') ?? undefined,
    includeArchived: params.get('archived') === 'true',
    sortField: (params.get('sort') as TestCaseSortField | null) ?? TestCaseSortField.CaseNumber,
    sortDirection: (params.get('direction') as SortDirection | null) ?? SortDirection.Asc,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 50,
  };
}

export function serializeRepositoryFilters(filters: RepositoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  const pairs: Array<[string, string | number | boolean | undefined]> = [
    ['q', filters.search || undefined],
    ['suite', filters.suiteId],
    ['priority', filters.priority],
    ['severity', filters.severity],
    ['type', filters.type],
    ['automation', filters.automationStatus],
    ['assignee', filters.assigneeId],
    ['tag', filters.tagId],
    ['archived', filters.includeArchived || undefined],
    ['sort', filters.sortField === TestCaseSortField.CaseNumber ? undefined : filters.sortField],
    ['direction', filters.sortDirection === SortDirection.Asc ? undefined : filters.sortDirection],
    ['page', filters.page === 1 ? undefined : filters.page],
    ['pageSize', filters.pageSize === 50 ? undefined : filters.pageSize],
  ];
  for (const [key, value] of pairs) if (value !== undefined) params.set(key, String(value));
  return params;
}
