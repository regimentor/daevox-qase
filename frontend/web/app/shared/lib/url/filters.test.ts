import { describe, expect, it } from 'vitest';
import { SortDirection, TestCasePriority, TestCaseSortField } from '@/shared/api/graphql';
import { parseRepositoryFilters, serializeRepositoryFilters } from '.';
describe('repository filter URL', () => {
  it('uses safe defaults', () =>
    expect(parseRepositoryFilters(new URLSearchParams())).toMatchObject({
      page: 1,
      pageSize: 50,
      search: '',
      includeArchived: false,
      sortField: TestCaseSortField.CaseNumber,
      sortDirection: SortDirection.Asc,
    }));
  it('parses and serializes filters', () => {
    const value = parseRepositoryFilters(
      new URLSearchParams('q=login&priority=HIGH&page=2&pageSize=20&archived=true&direction=DESC'),
    );
    expect(value.priority).toBe(TestCasePriority.High);
    expect(serializeRepositoryFilters(value).toString()).toContain('priority=HIGH');
  });
  it('rejects invalid pagination', () =>
    expect(parseRepositoryFilters(new URLSearchParams('page=-1&pageSize=12'))).toMatchObject({
      page: 1,
      pageSize: 50,
    }));
});
