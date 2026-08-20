import { useMutation, useQuery } from '@apollo/client/react';
import {
  Alert,
  App,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Radio,
  Space,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import {
  CreateTestResultDocument,
  RunCaseDocument,
  RunSummaryDocument,
  TestResultStatus,
  TestResultsDocument,
  TestRunDocument,
  type TestStepResultInput,
} from '@/shared/api/graphql';
import { formatDate, formatDuration } from '@/shared/lib/dates';
import { applyServerFieldErrors } from '@/shared/lib/errors';
import { StatusTag } from '@/shared/ui';

interface Draft {
  status?: TestResultStatus;
  comment?: string;
  durationSeconds?: number;
}

export function ResultSubmitPanel({
  runId,
  runCaseId,
  stepResults,
  attachmentIds,
  attachmentControl,
  disabled,
  onSubmitted,
}: {
  runId: string;
  runCaseId: string;
  stepResults: TestStepResultInput[];
  attachmentIds: string[];
  attachmentControl: React.ReactNode;
  disabled?: boolean;
  onSubmitted(): void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Draft>();
  const [error, setError] = useState<string>();
  const storageKey = `daevox.result-draft.${runCaseId}`;
  const history = useQuery(TestResultsDocument, {
    variables: { runCaseId, page: { limit: 50, offset: 0 } },
  });
  const [submit, state] = useMutation(CreateTestResultDocument, {
    refetchQueries: [
      { query: TestResultsDocument, variables: { runCaseId, page: { limit: 50, offset: 0 } } },
      { query: TestRunDocument, variables: { id: runId } },
      { query: RunCaseDocument, variables: { id: runCaseId } },
      { query: RunSummaryDocument, variables: { runId } },
    ],
  });
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      form.setFieldsValue(saved ? (JSON.parse(saved) as Draft) : {});
    } catch {
      form.resetFields();
    }
  }, [form, storageKey]);
  const persist = (_: Partial<Draft>, values: Draft) =>
    sessionStorage.setItem(storageKey, JSON.stringify(values));
  const send = async (values: Draft) => {
    setError(undefined);
    try {
      await submit({
        variables: {
          input: {
            runCaseId,
            status: values.status!,
            comment: values.comment?.trim() || null,
            durationSeconds: values.durationSeconds ?? null,
            steps: stepResults,
            attachmentIds,
          },
        },
      });
      sessionStorage.removeItem(storageKey);
      form.resetFields();
      void message.success('Результат сохранён. История попыток обновлена.');
      onSubmitted();
    } catch (reason) {
      setError(applyServerFieldErrors(form, reason).message);
    }
  };
  return (
    <aside className="result-panel">
      <Typography.Title level={4}>Результат попытки</Typography.Title>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
      <Form
        form={form}
        layout="vertical"
        onFinish={send}
        onValuesChange={persist}
        disabled={disabled || state.loading}
      >
        <Form.Item
          label="Общий статус"
          name="status"
          rules={[{ required: true, message: 'Выберите итоговый статус' }]}
        >
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: TestResultStatus.Passed, label: 'Пройден' },
              { value: TestResultStatus.Failed, label: 'Провален' },
              { value: TestResultStatus.Blocked, label: 'Блокирован' },
              { value: TestResultStatus.Skipped, label: 'Пропущен' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Комментарий" name="comment">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Длительность, секунд" name="durationSeconds">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        {attachmentControl}
        <Button type="primary" htmlType="submit" loading={state.loading} block>
          Сохранить результат
        </Button>
      </Form>
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        История попыток
      </Typography.Title>
      {history.error && <Alert type="error" title="Не удалось загрузить историю" />}
      {!history.loading && !history.data?.testResults.items.length && (
        <Typography.Text type="secondary">Попыток ещё нет</Typography.Text>
      )}
      <Collapse
        size="small"
        items={history.data?.testResults.items.map((result, index) => ({
          key: result.id,
          label: (
            <Space>
              <StatusTag status={result.status} /> {formatDate(result.createdAt)}
            </Space>
          ),
          children: (
            <Space orientation="vertical">
              <span>{result.comment || 'Без комментария'}</span>
              <span>Длительность: {formatDuration(result.durationSeconds)}</span>
              <span>
                Шагов: {result.stepResults.length}; вложений: {result.attachments.length}
              </span>
              {result.attachments.length > 0 && (
                <Space orientation="vertical" size={4}>
                  <Typography.Text strong>Вложения</Typography.Text>
                  {result.attachments.map((attachment) =>
                    attachment.downloadUrl ? (
                      <Typography.Link
                        key={attachment.id}
                        href={attachment.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {attachment.filename}
                      </Typography.Link>
                    ) : (
                      <Typography.Text key={attachment.id} type="secondary">
                        {attachment.filename} (недоступно)
                      </Typography.Text>
                    ),
                  )}
                </Space>
              )}
              {index > 0 && (
                <Typography.Text type="secondary">Предыдущая попытка сохранена</Typography.Text>
              )}
            </Space>
          ),
        }))}
      />
    </aside>
  );
}
