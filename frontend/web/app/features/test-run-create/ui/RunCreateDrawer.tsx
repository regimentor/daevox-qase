import { useMutation, useQuery } from '@apollo/client/react';
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Steps,
  Table,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import {
  CreateTestRunDocument,
  EnvironmentsDocument,
  TestCasesDocument,
  TestPlansDocument,
  TestRunsDocument,
  WorkspaceMembersDocument,
} from '@/shared/api/graphql';
import { applyServerFieldErrors } from '@/shared/lib/errors';

interface Values {
  title: string;
  environmentId?: string;
  source: 'plan' | 'cases';
  testPlanId?: string;
  defaultAssigneeId?: string;
}
export function RunCreateDrawer({
  open,
  projectId,
  workspaceId,
  initialCaseIds = [],
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  workspaceId: string;
  initialCaseIds?: string[];
  onClose(): void;
  onCreated(id: string): void;
}) {
  const [form] = Form.useForm<Values>();
  const [step, setStep] = useState(0);
  const [caseIds, setCaseIds] = useState<string[]>(initialCaseIds);
  const [error, setError] = useState<string>();
  const environments = useQuery(EnvironmentsDocument, {
    variables: { projectId, page: { limit: 100, offset: 0 } },
    skip: !open,
  });
  const plans = useQuery(TestPlansDocument, {
    variables: { projectId, page: { limit: 100, offset: 0 } },
    skip: !open,
  });
  const cases = useQuery(TestCasesDocument, {
    variables: { projectId, filter: null, sort: null, page: { limit: 100, offset: 0 } },
    skip: !open,
  });
  const members = useQuery(WorkspaceMembersDocument, {
    variables: { workspaceId, page: { limit: 100, offset: 0 } },
    skip: !open,
  });
  const [create, state] = useMutation(CreateTestRunDocument, {
    refetchQueries: [
      {
        query: TestRunsDocument,
        variables: { projectId, status: null, page: { limit: 20, offset: 0 } },
      },
    ],
  });
  const watchOptions = { form, preserve: true };
  const source = Form.useWatch('source', watchOptions);
  const planId = Form.useWatch('testPlanId', watchOptions);
  const values = Form.useWatch([], watchOptions);
  const count =
    source === 'plan'
      ? (plans.data?.testPlans.items.find((item) => item.id === planId)?.testCases.length ?? 0)
      : caseIds.length;
  const next = async () => {
    try {
      if (step === 0) await form.validateFields(['title', 'environmentId']);
      if (step === 1) {
        await form.validateFields(['source']);
        if (source === 'plan') await form.validateFields(['testPlanId']);
        else if (!caseIds.length) {
          setError('Выберите хотя бы один тест-кейс.');
          return;
        }
      }
      setError(undefined);
      setStep((value) => Math.min(2, value + 1));
    } catch {
      return;
    }
  };
  const submit = async () => {
    await form.validateFields();
    const current = form.getFieldsValue(true);
    setError(undefined);
    try {
      const result = await create({
        variables: {
          input: {
            projectId,
            title: current.title.trim(),
            environmentId: current.environmentId ?? null,
            defaultAssigneeId: current.defaultAssigneeId ?? null,
            testPlanId: current.source === 'plan' ? (current.testPlanId ?? null) : null,
            testCaseIds: current.source === 'cases' ? caseIds : null,
          },
        },
      });
      if (result.data) onCreated(result.data.createTestRun.id);
    } catch (reason) {
      setError(applyServerFieldErrors(form, reason).message);
    }
  };
  const selectedPlan = useMemo(
    () => plans.data?.testPlans.items.find((item) => item.id === planId),
    [plans.data, planId],
  );
  return (
    <Drawer
      title="Создать тестовый запуск"
      size={760}
      open={open}
      onClose={onClose}
      extra={
        <Steps
          size="small"
          current={step}
          items={[{ title: 'Основное' }, { title: 'Источник' }, { title: 'Проверка' }]}
        />
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ source: initialCaseIds.length ? 'cases' : 'plan' }}
        disabled={state.loading}
      >
        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
        {step === 0 && (
          <>
            <Form.Item
              label="Название запуска"
              name="title"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input autoFocus />
            </Form.Item>
            <Form.Item label="Окружение" name="environmentId">
              <Select
                allowClear
                loading={environments.loading}
                options={environments.data?.environments.items.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </Form.Item>
            <Form.Item label="Исполнитель по умолчанию" name="defaultAssigneeId">
              <Select
                allowClear
                loading={members.loading}
                options={members.data?.workspaceMembers.items.map((item) => ({
                  value: item.userId,
                  label: `${item.user.name} · ${item.user.email}`,
                }))}
              />
            </Form.Item>
          </>
        )}
        {step === 1 && (
          <>
            <Form.Item label="Источник" name="source" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'plan', label: 'Тест-план' },
                  { value: 'cases', label: 'Выбрать тест-кейсы' },
                ]}
              />
            </Form.Item>
            {source === 'plan' ? (
              <Form.Item
                label="Тест-план"
                name="testPlanId"
                rules={[{ required: true, message: 'Выберите тест-план' }]}
              >
                <Select
                  loading={plans.loading}
                  options={plans.data?.testPlans.items.map((item) => ({
                    value: item.id,
                    label: `${item.title} · ${item.testCases.length}`,
                  }))}
                />
              </Form.Item>
            ) : (
              <Table
                rowKey="id"
                loading={cases.loading}
                dataSource={cases.data?.testCases.items}
                pagination={{ pageSize: 8 }}
                columns={[
                  {
                    title: '',
                    width: 48,
                    render: (_, item) => (
                      <Checkbox
                        checked={caseIds.includes(item.id)}
                        aria-label={`Выбрать ${item.displayId}`}
                        onChange={(event) =>
                          setCaseIds((ids) =>
                            event.target.checked
                              ? [...ids, item.id]
                              : ids.filter((id) => id !== item.id),
                          )
                        }
                      />
                    ),
                  },
                  { title: 'ID', dataIndex: 'displayId', width: 110 },
                  { title: 'Название', dataIndex: 'title' },
                ]}
              />
            )}
          </>
        )}
        {step === 2 && (
          <Space orientation="vertical" size={12}>
            <Typography.Title level={4}>{values?.title}</Typography.Title>
            <Typography.Text>
              Источник:{' '}
              {source === 'plan' ? selectedPlan?.title : `${caseIds.length} выбранных кейсов`}
            </Typography.Text>
            <Typography.Text>Кейсов в snapshot: {count}</Typography.Text>
            <Typography.Text>
              Окружение:{' '}
              {environments.data?.environments.items.find(
                (item) => item.id === values?.environmentId,
              )?.name ?? 'Не задано'}
            </Typography.Text>
          </Space>
        )}
        <Space style={{ marginTop: 24 }}>
          {step > 0 && <Button onClick={() => setStep((value) => value - 1)}>Назад</Button>}
          {step < 2 ? (
            <Button type="primary" onClick={() => void next()}>
              Продолжить
            </Button>
          ) : (
            <Button type="primary" loading={state.loading} onClick={() => void submit()}>
              Создать запуск
            </Button>
          )}
        </Space>
      </Form>
    </Drawer>
  );
}
