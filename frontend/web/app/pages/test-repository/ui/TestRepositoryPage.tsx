import {
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client/react';
import { App, Button, Checkbox, Input, Select, Space, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useProjectContext } from '@/entities/project';
import { TestCaseDrawer } from '@/features/test-case-edit';
import { RunCreateDrawer } from '@/features/test-run-create';
import { SuiteTree } from '@/widgets/suite-tree';
import { TestCaseTable } from '@/widgets/test-case-table';
import {
  ArchiveTestCaseDocument,
  SortDirection,
  TestCasesDocument,
  TestCaseSortField,
  type TestCaseFieldsFragment,
} from '@/shared/api/graphql';
import { ErrorState, labels, PageHeader } from '@/shared/ui';
import { parseRepositoryFilters, serializeRepositoryFilters } from '@/shared/lib/url';
import { toFrontendError } from '@/shared/lib/errors';
import { routes } from '@/shared/routes';

export function TestRepositoryPage() {
  const { project, workspace, readOnly } = useProjectContext();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseRepositoryFilters(params), [params]);
  const [search, setSearch] = useState(filters.search);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [drawerCase, setDrawerCase] = useState<TestCaseFieldsFragment | 'new'>();
  const [createRunOpen, setCreateRunOpen] = useState(false);
  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== filters.search)
        setParams(serializeRepositoryFilters({ ...filters, search, page: 1 }), { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filters, setParams]);
  const filterKey = params.toString();
  useEffect(() => setSelected([]), [filterKey]);
  const query = useQuery(TestCasesDocument, {
    variables: {
      projectId: project.id,
      filter: {
        suiteId: filters.suiteId ?? null,
        search: filters.search || null,
        priority: filters.priority ?? null,
        severity: filters.severity ?? null,
        type: filters.type ?? null,
        automationStatus: filters.automationStatus ?? null,
        assigneeId: filters.assigneeId ?? null,
        tagId: filters.tagId ?? null,
        includeArchived: filters.includeArchived,
      },
      sort: { field: filters.sortField, direction: filters.sortDirection },
      page: { limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize },
    },
  });
  const [archive] = useMutation(ArchiveTestCaseDocument, { refetchQueries: [TestCasesDocument] });
  const update = (patch: Partial<typeof filters>) =>
    setParams(serializeRepositoryFilters({ ...filters, ...patch, page: patch.page ?? 1 }));
  const archiveCase = (item: TestCaseFieldsFragment) =>
    modal.confirm({
      title: `Архивировать ${item.displayId}?`,
      content: 'Кейс исчезнет из активного repository, история запусков сохранится.',
      okText: 'Архивировать',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await archive({ variables: { id: item.id } });
          void message.success('Тест-кейс архивирован');
        } catch (error) {
          void message.error(toFrontendError(error).message);
        }
      },
    });
  const active = [
    ['priority', filters.priority && labels.priority[filters.priority]],
    ['severity', filters.severity && labels.severity[filters.severity]],
    ['type', filters.type && labels.type[filters.type]],
    ['automationStatus', filters.automationStatus && labels.automation[filters.automationStatus]],
    ['includeArchived', filters.includeArchived && 'С архивом'],
  ] as const;
  return (
    <main className="page repository-page">
      <PageHeader
        title="Test Repository"
        description={`${project.code} · источник тест-кейсов`}
        extra={
          <Space>
            <Button
              icon={<RocketOutlined />}
              disabled={!selected.length || readOnly}
              onClick={() => setCreateRunOpen(true)}
            >
              Создать run из выбранных ({selected.length})
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={readOnly}
              title={readOnly ? 'Архивный проект доступен только для чтения' : undefined}
              onClick={() => setDrawerCase('new')}
            >
              Создать test case
            </Button>
          </Space>
        }
      />
      <div className="repository-layout">
        <aside className="suite-panel surface">
          <SuiteTree
            projectId={project.id}
            selected={filters.suiteId}
            disabled={readOnly}
            onSelect={(suiteId) => update({ suiteId })}
          />
        </aside>
        <section className="repository-main">
          <div className="repository-toolbar surface">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              aria-label="Поиск тест-кейсов"
              placeholder="Поиск по ID или названию"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 280 }}
            />
            <Select
              allowClear
              aria-label="Фильтр по приоритету"
              placeholder="Приоритет"
              value={filters.priority}
              onChange={(priority) => update({ priority })}
              options={Object.entries(labels.priority).map(([value, label]) => ({ value, label }))}
            />
            <Select
              allowClear
              aria-label="Фильтр по серьёзности"
              placeholder="Серьёзность"
              value={filters.severity}
              onChange={(severity) => update({ severity })}
              options={Object.entries(labels.severity).map(([value, label]) => ({ value, label }))}
            />
            <Select
              allowClear
              aria-label="Фильтр по типу"
              placeholder="Тип"
              value={filters.type}
              onChange={(type) => update({ type })}
              options={Object.entries(labels.type).map(([value, label]) => ({ value, label }))}
            />
            <Select
              value={filters.sortField}
              aria-label="Сортировка"
              onChange={(sortField) => update({ sortField })}
              options={[
                { value: TestCaseSortField.CaseNumber, label: 'По ID' },
                { value: TestCaseSortField.Title, label: 'По названию' },
                { value: TestCaseSortField.UpdatedAt, label: 'По обновлению' },
                { value: TestCaseSortField.Priority, label: 'По приоритету' },
              ]}
            />
            <Button
              aria-label="Направление сортировки"
              onClick={() =>
                update({
                  sortDirection:
                    filters.sortDirection === SortDirection.Asc
                      ? SortDirection.Desc
                      : SortDirection.Asc,
                })
              }
            >
              {filters.sortDirection === SortDirection.Asc ? '↑' : '↓'}
            </Button>
            <Checkbox
              checked={filters.includeArchived}
              onChange={(event) => update({ includeArchived: event.target.checked })}
            >
              Архив
            </Checkbox>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearch('');
                setParams(new URLSearchParams());
              }}
            >
              Сбросить
            </Button>
          </div>
          {active.some(([, label]) => label) && (
            <Space wrap className="active-filters">
              <FilterOutlined />
              {active.map(
                ([key, label]) =>
                  label && (
                    <Tag
                      closable
                      key={key}
                      onClose={() =>
                        update({ [key]: key === 'includeArchived' ? false : undefined })
                      }
                    >
                      {label}
                    </Tag>
                  ),
              )}
            </Space>
          )}
          <div className="surface table-surface">
            {query.error && !query.data ? (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} />
            ) : (
              <TestCaseTable
                data={query.data?.testCases.items ?? []}
                loading={query.loading}
                total={query.data?.testCases.pageInfo.total ?? 0}
                page={filters.page}
                pageSize={filters.pageSize}
                selectedKeys={selected}
                onSelectionChange={setSelected}
                onPageChange={(page, pageSize) => update({ page, pageSize })}
                onOpen={setDrawerCase}
                onArchive={archiveCase}
                emptyText={
                  filters.search || active.some(([, label]) => label)
                    ? 'По фильтрам ничего не найдено'
                    : 'Тест-кейсов пока нет'
                }
              />
            )}
          </div>
        </section>
      </div>
      {drawerCase && (
        <TestCaseDrawer
          open
          projectId={project.id}
          testCase={drawerCase === 'new' ? undefined : drawerCase}
          defaultSuiteId={filters.suiteId}
          readOnly={readOnly}
          onClose={() => setDrawerCase(undefined)}
        />
      )}
      {createRunOpen && (
        <RunCreateDrawer
          open
          projectId={project.id}
          workspaceId={workspace.id}
          initialCaseIds={selected.map(String)}
          onClose={() => setCreateRunOpen(false)}
          onCreated={(runId) => {
            setSelected([]);
            setCreateRunOpen(false);
            navigate(routes.run(workspace.id, project.id, runId));
          }}
        />
      )}
    </main>
  );
}
