import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import {
  ArchiveTestCaseDocument,
  AutomationStatus,
  CreateTestCaseDocument,
  ReplaceTestCaseStepsDocument,
  ReplaceTestCaseTagsDocument,
  SuiteTreeDocument,
  TagsDocument,
  TestCasePriority,
  TestCaseSeverity,
  TestCasesDocument,
  TestCaseType,
  UpdateTestCaseDocument,
  type TestCaseFieldsFragment,
  type TestStepInput,
} from '@/shared/api/graphql';
import { labels, PriorityTag, SeverityTag } from '@/shared/ui';
import { formatDate, formatDuration } from '@/shared/lib/dates';
import { applyServerFieldErrors, toFrontendError } from '@/shared/lib/errors';

interface CaseForm {
  suiteId: string;
  title: string;
  description?: string;
  preconditions?: string;
  postconditions?: string;
  priority: TestCasePriority;
  severity: TestCaseSeverity;
  type: TestCaseType;
  automationStatus: AutomationStatus;
  assigneeId?: string;
  estimatedDurationSeconds?: number;
  tagIds: string[];
  steps: TestStepInput[];
}
const nullable = (value?: string) => value?.trim() || null;
export function TestCaseDrawer({
  open,
  projectId,
  testCase,
  defaultSuiteId,
  readOnly,
  onClose,
}: {
  open: boolean;
  projectId: string;
  testCase?: TestCaseFieldsFragment;
  defaultSuiteId?: string;
  readOnly?: boolean;
  onClose(): void;
}) {
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState(!testCase);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [form] = Form.useForm<CaseForm>();
  const suites = useQuery(SuiteTreeDocument, { variables: { projectId }, skip: !open });
  const tags = useQuery(TagsDocument, { variables: { projectId }, skip: !open });
  const [create, createState] = useMutation(CreateTestCaseDocument, {
    refetchQueries: [TestCasesDocument],
  });
  const [update, updateState] = useMutation(UpdateTestCaseDocument);
  const [replaceSteps] = useMutation(ReplaceTestCaseStepsDocument);
  const [replaceTags] = useMutation(ReplaceTestCaseTagsDocument);
  const [archive, archiveState] = useMutation(ArchiveTestCaseDocument, {
    refetchQueries: [TestCasesDocument],
  });
  useEffect(() => {
    if (!open) return;
    setEditing(!testCase);
    setDirty(false);
    setError(undefined);
    form.setFieldsValue({
      suiteId: testCase?.suiteId ?? defaultSuiteId,
      title: testCase?.title ?? '',
      description: testCase?.description ?? '',
      preconditions: testCase?.preconditions ?? '',
      postconditions: testCase?.postconditions ?? '',
      priority: testCase?.priority ?? TestCasePriority.Medium,
      severity: testCase?.severity ?? TestCaseSeverity.Normal,
      type: testCase?.type ?? TestCaseType.Functional,
      automationStatus: testCase?.automationStatus ?? AutomationStatus.Manual,
      assigneeId: testCase?.assigneeId ?? undefined,
      estimatedDurationSeconds: testCase?.estimatedDurationSeconds ?? undefined,
      tagIds: testCase?.tags.map((tag) => tag.id) ?? [],
      steps: testCase?.steps.map(({ action, testData, expectedResult }) => ({
        action,
        testData,
        expectedResult,
      })) ?? [{ action: '', testData: null, expectedResult: '' }],
    });
  }, [open, testCase, defaultSuiteId, form]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener('beforeunload', handler);
    return () => removeEventListener('beforeunload', handler);
  }, [dirty]);
  const requestClose = () => {
    if (!dirty) onClose();
    else
      modal.confirm({
        title: 'Закрыть без сохранения?',
        content: 'Несохранённые изменения будут потеряны.',
        okText: 'Закрыть',
        okButtonProps: { danger: true },
        onOk: onClose,
      });
  };
  const save = async (values: CaseForm) => {
    setError(undefined);
    const steps = values.steps.map((step) => ({
      action: step.action.trim(),
      testData: nullable(step.testData ?? undefined),
      expectedResult: step.expectedResult.trim(),
    }));
    try {
      if (!testCase) {
        await create({
          variables: {
            input: {
              projectId,
              suiteId: values.suiteId,
              title: values.title.trim(),
              description: nullable(values.description),
              preconditions: nullable(values.preconditions),
              postconditions: nullable(values.postconditions),
              priority: values.priority,
              severity: values.severity,
              type: values.type,
              automationStatus: values.automationStatus,
              assigneeId: nullable(values.assigneeId),
              estimatedDurationSeconds: values.estimatedDurationSeconds ?? null,
              tagIds: values.tagIds,
              steps,
            },
          },
        });
      } else {
        await update({
          variables: {
            id: testCase.id,
            input: {
              suiteId: values.suiteId,
              title: values.title.trim(),
              description: nullable(values.description),
              preconditions: nullable(values.preconditions),
              postconditions: nullable(values.postconditions),
              priority: values.priority,
              severity: values.severity,
              type: values.type,
              automationStatus: values.automationStatus,
              assigneeId: nullable(values.assigneeId),
              estimatedDurationSeconds: values.estimatedDurationSeconds ?? null,
            },
          },
        });
        await Promise.all([
          replaceSteps({ variables: { testCaseId: testCase.id, steps } }),
          replaceTags({ variables: { testCaseId: testCase.id, tagIds: values.tagIds } }),
        ]);
      }
      setDirty(false);
      void message.success('Тест-кейс сохранён');
      onClose();
    } catch (reason) {
      setError(applyServerFieldErrors(form, reason).message);
    }
  };
  const doArchive = async () => {
    if (!testCase) return;
    try {
      await archive({ variables: { id: testCase.id } });
      void message.success('Тест-кейс архивирован');
      onClose();
    } catch (reason) {
      void message.error(toFrontendError(reason).message);
    }
  };
  const suiteOptions = (suites.data?.suiteTree ?? []).map((suite) => ({
    value: suite.id,
    label: suite.title,
  }));
  const pending = createState.loading || updateState.loading;
  return (
    <Drawer
      getContainer={false}
      size={720}
      open={open}
      onClose={requestClose}
      title={testCase ? `${testCase.displayId} · ${testCase.title}` : 'Новый тест-кейс'}
      extra={
        <Space>
          {testCase && !editing && (
            <Button icon={<EditOutlined />} disabled={readOnly} onClick={() => setEditing(true)}>
              Редактировать
            </Button>
          )}
          {testCase && !testCase.archivedAt && (
            <Button
              danger
              loading={archiveState.loading}
              disabled={readOnly}
              onClick={() => void doArchive()}
            >
              Архивировать
            </Button>
          )}
        </Space>
      }
    >
      {!editing && <Form form={form} component={false} />}
      {!editing && testCase ? (
        <Space orientation="vertical" size={18} style={{ display: 'flex' }} tabIndex={0}>
          <Descriptions
            column={2}
            bordered
            size="small"
            items={[
              { key: 'p', label: 'Приоритет', children: <PriorityTag value={testCase.priority} /> },
              {
                key: 's',
                label: 'Серьёзность',
                children: <SeverityTag value={testCase.severity} />,
              },
              { key: 't', label: 'Тип', children: labels.type[testCase.type] },
              {
                key: 'a',
                label: 'Автоматизация',
                children: labels.automation[testCase.automationStatus],
              },
              {
                key: 'd',
                label: 'Оценка',
                children: formatDuration(testCase.estimatedDurationSeconds),
              },
              { key: 'u', label: 'Обновлён', children: formatDate(testCase.updatedAt) },
            ]}
          />
          <section>
            <Typography.Title level={5}>Описание</Typography.Title>
            <div className="plain-text">{testCase.description || '—'}</div>
          </section>
          <section>
            <Typography.Title level={5}>Предусловия</Typography.Title>
            <div className="plain-text">{testCase.preconditions || '—'}</div>
          </section>
          <section>
            <Typography.Title level={5}>Шаги</Typography.Title>
            {testCase.steps.map((step) => (
              <div className="case-step" key={step.id}>
                <strong>
                  {step.position + 1}. {step.action}
                </strong>
                {step.testData && <div>Данные: {step.testData}</div>}
                <div>Ожидается: {step.expectedResult}</div>
              </div>
            ))}
          </section>
          <Space wrap>
            {testCase.tags.map((tag) => (
              <Tag key={tag.id}>{tag.name}</Tag>
            ))}
          </Space>
        </Space>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          onValuesChange={() => setDirty(true)}
          disabled={pending || readOnly}
        >
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
          <Form.Item
            label="Suite"
            name="suiteId"
            rules={[{ required: true, message: 'Выберите suite' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={suites.loading}
              options={suiteOptions}
            />
          </Form.Item>
          <Form.Item label="Название" name="title" rules={[{ required: true, whitespace: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="Описание" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Предусловия" name="preconditions">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Постусловия" name="postconditions">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space wrap align="start">
            <Form.Item label="Приоритет" name="priority">
              <Select
                style={{ width: 150 }}
                options={Object.entries(labels.priority).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
            <Form.Item label="Серьёзность" name="severity">
              <Select
                style={{ width: 170 }}
                options={Object.entries(labels.severity).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
            <Form.Item label="Тип" name="type">
              <Select
                style={{ width: 180 }}
                options={Object.entries(labels.type).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
            <Form.Item label="Автоматизация" name="automationStatus">
              <Select
                style={{ width: 190 }}
                options={Object.entries(labels.automation).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
          </Space>
          <Form.Item label="Оценка, секунд" name="estimatedDurationSeconds">
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item label="Теги" name="tagIds">
            <Select
              mode="multiple"
              loading={tags.loading}
              options={tags.data?.tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            />
          </Form.Item>
          <Divider>Шаги</Divider>
          <Form.List name="steps">
            {(fields, { add, remove, move }) => (
              <Space orientation="vertical" style={{ display: 'flex' }}>
                {fields.map((field, index) => (
                  <div className="step-editor" key={field.key}>
                    <Space align="start">
                      <Typography.Text strong>{index + 1}</Typography.Text>
                      <Button
                        type="text"
                        aria-label="Переместить шаг выше"
                        disabled={index === 0}
                        icon={<ArrowUpOutlined />}
                        onClick={() => move(index, index - 1)}
                      />
                      <Button
                        type="text"
                        aria-label="Переместить шаг ниже"
                        disabled={index === fields.length - 1}
                        icon={<ArrowDownOutlined />}
                        onClick={() => move(index, index + 1)}
                      />
                      <Button
                        type="text"
                        aria-label="Дублировать шаг"
                        icon={<CopyOutlined />}
                        onClick={() => add(form.getFieldValue(['steps', index]), index + 1)}
                      />
                      <Button
                        type="text"
                        danger
                        aria-label="Удалить шаг"
                        icon={<DeleteOutlined />}
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      />
                    </Space>
                    <Form.Item
                      label="Действие"
                      name={[field.name, 'action']}
                      rules={[{ required: true, whitespace: true }]}
                    >
                      <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
                    </Form.Item>
                    <Form.Item label="Тестовые данные" name={[field.name, 'testData']}>
                      <Input.TextArea autoSize />
                    </Form.Item>
                    <Form.Item
                      label="Ожидаемый результат"
                      name={[field.name, 'expectedResult']}
                      rules={[{ required: true, whitespace: true }]}
                    >
                      <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
                    </Form.Item>
                  </div>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ action: '', testData: null, expectedResult: '' })}
                >
                  Добавить шаг
                </Button>
              </Space>
            )}
          </Form.List>
          <Divider />
          <Space>
            <Button type="primary" htmlType="submit" loading={pending}>
              Сохранить
            </Button>
            <Button onClick={requestClose}>Отмена</Button>
          </Space>
        </Form>
      )}
    </Drawer>
  );
}
