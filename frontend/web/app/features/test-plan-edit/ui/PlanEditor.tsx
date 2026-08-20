import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  Modal,
  Space,
  Table,
  TreeSelect,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import {
  CreateTestPlanDocument,
  PlanSourceChangePreviewDocument,
  ReplaceTestPlanSourcesDocument,
  SuiteTreeDocument,
  TestCasesDocument,
  TestPlanDocument,
  TestPlansDocument,
  UpdateTestPlanDocument,
} from '@/shared/api/graphql';
import { applyServerFieldErrors } from '@/shared/lib/errors';

type SuiteTreeItem = { id: string; title: string; children?: readonly SuiteTreeItem[] };
type SuiteOption = { key: string; value: string; title: string; children?: SuiteOption[] };

const suiteOptions = (items: readonly SuiteTreeItem[]): SuiteOption[] =>
  items.map((suite) => ({
    key: suite.id,
    value: suite.id,
    title: suite.title,
    ...(suite.children?.length ? { children: suiteOptions(suite.children) } : {}),
  }));

export function PlanEditor({
  open,
  projectId,
  planId,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  planId?: string;
  onClose(): void;
  onSaved?(id: string): void;
}) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<{ title: string; description?: string }>();
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [manualCaseIds, setManualCaseIds] = useState<string[]>([]);
  const [sourceSuiteIds, setSourceSuiteIds] = useState<string[]>([]);
  const [selector, setSelector] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const plan = useQuery(TestPlanDocument, {
    variables: { id: planId ?? '' },
    skip: !planId || !open,
  });
  const cases = useQuery(TestCasesDocument, {
    variables: { projectId, filter: null, sort: null, page: { limit: 100, offset: 0 } },
    skip: !selector,
    fetchPolicy: 'network-only',
  });
  const suites = useQuery(SuiteTreeDocument, {
    variables: { projectId, includeArchived: false },
    skip: !open,
  });
  const [create, createState] = useMutation(CreateTestPlanDocument);
  const [update, updateState] = useMutation(UpdateTestPlanDocument);
  const [replaceSources] = useMutation(ReplaceTestPlanSourcesDocument);
  const [sourcePreview] = useLazyQuery(PlanSourceChangePreviewDocument);
  useEffect(() => {
    if (!open) return;
    const value = plan.data?.testPlan;
    form.setFieldsValue({ title: value?.title ?? '', description: value?.description ?? '' });
    setCaseIds(value?.testCases.map((item) => item.id) ?? []);
    setManualCaseIds(value?.manualCaseIds ?? []);
    setSourceSuiteIds(value?.sourceSuites.map((suite) => suite.id) ?? []);
    setDirty(false);
    setError(undefined);
  }, [open, plan.data, form]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener('beforeunload', handler);
    return () => removeEventListener('beforeunload', handler);
  }, [dirty]);
  const available = cases.data?.testCases.items ?? [];
  const byId = useMemo(() => new Map(available.map((item) => [item.id, item])), [available]);
  const close = () =>
    dirty
      ? modal.confirm({
          title: 'Закрыть без сохранения?',
          okButtonProps: { danger: true },
          onOk: onClose,
        })
      : onClose();
  const save = async (values: { title: string; description?: string }) => {
    setError(undefined);
    try {
      let id = planId;
      let successMessage = 'Тест-план сохранён';
      if (id) {
        const previous = plan.data?.testPlan;
        const previousSources = previous?.sourceSuites.map((suite) => suite.id) ?? [];
        const previousManual = previous?.manualCaseIds ?? [];
        const previousOrder = previous?.testCases.map((testCase) => testCase.id) ?? [];
        const sourcesChanged =
          previousSources.length !== sourceSuiteIds.length ||
          previousSources.some((suiteId) => !sourceSuiteIds.includes(suiteId));
        const manualChanged =
          previousManual.length !== manualCaseIds.length ||
          previousManual.some((caseId) => !manualCaseIds.includes(caseId));
        const orderChanged =
          previousOrder.length !== caseIds.length ||
          previousOrder.some((caseId, index) => caseIds[index] !== caseId);
        if (sourcesChanged) {
          const result = await sourcePreview({
            variables: { testPlanId: id, sourceSuiteIds },
          });
          const removed = result.data?.planSourceChangePreview.removedCaseCount ?? 0;
          if (removed) {
            const confirmed = await new Promise<boolean>((resolve) =>
              modal.confirm({
                title: 'Удалить кейсы из плана?',
                content: `Из-за изменения source suites будут удалены ${removed} кейс(ов), если они не выбраны вручную и не покрываются другой suite.`,
                okText: 'Продолжить',
                cancelText: 'Отмена',
                okButtonProps: { danger: true },
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
              }),
            );
            if (!confirmed) return;
          }
        }
        await update({
          variables: {
            id,
            input: { title: values.title.trim(), description: values.description?.trim() || null },
          },
        });
        if (sourcesChanged || manualChanged || orderChanged) {
          const result = await replaceSources({
            variables: {
              testPlanId: id,
              sourceSuiteIds,
              manualTestCaseIds: manualCaseIds,
              orderedTestCaseIds: caseIds,
            },
          });
          const summary = result.data?.replaceTestPlanSources;
          const details = summary
            ? `Добавлено: ${summary.addedCaseCount}, удалено: ${summary.removedCaseCount}`
            : '';
          successMessage = `Синхронизация тест-плана завершена. ${details}`.trim();
        }
      } else {
        const result = await create({
          variables: {
            projectId,
            title: values.title.trim(),
            description: values.description?.trim() || null,
            testCaseIds: caseIds,
            sourceSuiteIds,
          },
          refetchQueries: [
            {
              query: TestPlansDocument,
              variables: { projectId, page: { limit: 50, offset: 0 } },
            },
          ],
        });
        id = result.data?.createTestPlan.id;
      }
      if (id) {
        setDirty(false);
        void message.success(successMessage);
        onSaved?.(id);
        onClose();
      }
    } catch (reason) {
      setError(applyServerFieldErrors(form, reason).message);
    }
  };
  const move = (index: number, offset: number) => {
    const next = caseIds.slice();
    const target = next[index + offset];
    const current = next[index];
    if (!target || !current) return;
    next[index] = target;
    next[index + offset] = current;
    setCaseIds(next);
    setDirty(true);
  };
  return (
    <Drawer
      title={planId ? 'Редактировать тест-план' : 'Новый тест-план'}
      size={760}
      open={open}
      onClose={close}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={save}
        onValuesChange={() => setDirty(true)}
        disabled={plan.loading || createState.loading || updateState.loading}
      >
        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
        <Form.Item label="Название" name="title" rules={[{ required: true, whitespace: true }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item label="Описание" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Source suites">
          <TreeSelect
            treeData={suiteOptions(suites.data?.suiteTree ?? [])}
            treeCheckable
            showCheckedStrategy={TreeSelect.SHOW_PARENT}
            value={sourceSuiteIds}
            onChange={(values) => {
              setSourceSuiteIds(values as string[]);
              setDirty(true);
            }}
            loading={suites.loading}
            placeholder="Выберите suites"
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Space style={{ marginBottom: 12 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Кейсы · {caseIds.length}
          </Typography.Title>
          <Button icon={<PlusOutlined />} onClick={() => setSelector(true)}>
            Добавить кейсы
          </Button>
        </Space>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={caseIds
            .map(
              (id) => byId.get(id) ?? plan.data?.testPlan.testCases.find((item) => item.id === id),
            )
            .filter((item) => item !== undefined)}
          columns={[
            { title: '#', render: (_, __, index) => index + 1, width: 50 },
            { title: 'ID', dataIndex: 'displayId', width: 100 },
            { title: 'Название', dataIndex: 'title' },
            {
              title: <span className="sr-only">Действия</span>,
              width: 130,
              render: (_, __, index) => (
                <Space>
                  <Button
                    type="text"
                    icon={<ArrowUpOutlined />}
                    disabled={!index}
                    aria-label="Переместить выше"
                    onClick={() => move(index, -1)}
                  />
                  <Button
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={index === caseIds.length - 1}
                    aria-label="Переместить ниже"
                    onClick={() => move(index, 1)}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label="Удалить из плана"
                    onClick={() => {
                      setCaseIds((ids) => ids.filter((_, itemIndex) => itemIndex !== index));
                      setManualCaseIds((ids) => ids.filter((id) => id !== caseIds[index]));
                      setDirty(true);
                    }}
                  />
                </Space>
              ),
            },
          ]}
        />
        <Button
          type="primary"
          htmlType="submit"
          loading={createState.loading || updateState.loading}
          style={{ marginTop: 18 }}
        >
          Сохранить
        </Button>
      </Form>
      <Modal
        title="Выбор тест-кейсов"
        open={selector}
        width={800}
        onCancel={() => setSelector(false)}
        onOk={() => setSelector(false)}
        okText="Готово"
      >
        <Table
          rowKey="id"
          loading={cases.loading}
          dataSource={[...available]}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: <span className="sr-only">Выбор</span>,
              width: 50,
              render: (_, item) => (
                <Checkbox
                  checked={caseIds.includes(item.id)}
                  aria-label={`Выбрать ${item.displayId}`}
                  onChange={(event) => {
                    setCaseIds((ids) =>
                      event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id),
                    );
                    setManualCaseIds((ids) =>
                      event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id),
                    );
                    setDirty(true);
                  }}
                />
              ),
            },
            { title: 'ID', dataIndex: 'displayId', width: 110 },
            { title: 'Название', dataIndex: 'title' },
            { title: 'Приоритет', dataIndex: 'priority' },
          ]}
        />
      </Modal>
    </Drawer>
  );
}
