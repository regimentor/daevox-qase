import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CloseOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Descriptions,
  Input,
  Progress,
  Radio,
  Select,
  Space,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { AttachmentUploader } from '@/features/attachment-upload';
import { ResultSubmitPanel } from '@/features/result-submit';
import {
  TestResultStatus,
  type RunCaseFieldsFragment,
  type TestStepResultInput,
} from '@/shared/api/graphql';
import { PriorityTag, SeverityTag, StatusTag } from '@/shared/ui';
import { clampPercentage } from '@/shared/lib/number';

interface StepDraft {
  status?: TestResultStatus;
  actualResult?: string;
}
export function ExecutionWorkspace({
  workspaceId,
  runId,
  title,
  cases,
  currentId,
  disabled,
  onSelect,
  onExit,
}: {
  workspaceId: string;
  runId: string;
  title: string;
  cases: readonly RunCaseFieldsFragment[];
  currentId: string;
  disabled?: boolean;
  onSelect(id: string): void;
  onExit(): void;
}) {
  const current = cases.find((item) => item.id === currentId) ?? cases[0];
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>();
  const [steps, setSteps] = useState<Record<string, StepDraft>>({});
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  useEffect(() => {
    if (!current) return;
    try {
      setSteps(
        JSON.parse(sessionStorage.getItem(`daevox.step-draft.${current.id}`) ?? '{}') as Record<
          string,
          StepDraft
        >,
      );
    } catch {
      setSteps({});
    }
    setAttachmentIds([]);
  }, [current?.id]);
  const filtered = useMemo(
    () =>
      cases.filter(
        (item) =>
          (!status || item.currentStatus === status) &&
          (!search ||
            `${item.displayId} ${item.title}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [cases, search, status],
  );
  if (!current) return <Card>В запуске нет кейсов.</Card>;
  const index = cases.findIndex((item) => item.id === current.id);
  const executed = cases.filter((item) => item.currentStatus !== 'UNTESTED').length;
  const patchStep = (id: string, patch: StepDraft) => {
    setSteps((value) => {
      const next = { ...value, [id]: { ...value[id], ...patch } };
      sessionStorage.setItem(`daevox.step-draft.${current.id}`, JSON.stringify(next));
      return next;
    });
  };
  const stepResults: TestStepResultInput[] = current.steps.flatMap((step) =>
    steps[step.id]?.status
      ? [
          {
            stepId: step.id,
            status: steps[step.id]!.status!,
            actualResult: steps[step.id]?.actualResult?.trim() || null,
          },
        ]
      : [],
  );
  const nextUntested =
    cases.find((item, itemIndex) => itemIndex > index && item.currentStatus === 'UNTESTED') ??
    cases.find((item) => item.currentStatus === 'UNTESTED');
  return (
    <div className="execution-shell">
      <header className="execution-header">
        <div>
          <Typography.Title level={1} style={{ fontSize: 20 }}>
            {title}
          </Typography.Title>
          <Typography.Text>
            {executed}/{cases.length} выполнено
          </Typography.Text>
        </div>
        <Progress
          aria-label={`Прогресс запуска: ${executed} из ${cases.length}`}
          percent={cases.length ? clampPercentage((executed / cases.length) * 100) : 0}
          showInfo={false}
        />
        <Button icon={<CloseOutlined />} onClick={onExit}>
          Выйти
        </Button>
      </header>
      <div className="execution-grid">
        <nav className="case-navigator" aria-label="Кейсы запуска">
          <Input
            aria-label="Поиск кейсов запуска"
            prefix={<SearchOutlined />}
            placeholder="Поиск"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            aria-label="Фильтр кейсов запуска по статусу"
            allowClear
            placeholder="Статус"
            value={status}
            onChange={setStatus}
            options={['UNTESTED', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED'].map((value) => ({
              value,
              label: value,
            }))}
          />
          <div className="navigator-list">
            {filtered.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`navigator-item ${item.id === current.id ? 'active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <StatusTag status={item.currentStatus} />
                <span>
                  <strong className="mono-id">{item.displayId}</strong>
                  <small>{item.title}</small>
                </span>
              </button>
            ))}
          </div>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              disabled={index <= 0}
              onClick={() => onSelect(cases[index - 1]!.id)}
            >
              Назад
            </Button>
            <Button
              icon={<ArrowRightOutlined />}
              disabled={index >= cases.length - 1}
              onClick={() => onSelect(cases[index + 1]!.id)}
            >
              Далее
            </Button>
          </Space>
        </nav>
        <main className="snapshot-content">
          <Space>
            <Typography.Text className="mono-id">{current.displayId}</Typography.Text>
            <StatusTag status={current.currentStatus} />
          </Space>
          <Typography.Title level={2}>{current.title}</Typography.Title>
          <Descriptions
            size="small"
            items={[
              { key: 'p', label: 'Приоритет', children: <PriorityTag value={current.priority} /> },
              {
                key: 's',
                label: 'Серьёзность',
                children: <SeverityTag value={current.severity} />,
              },
            ]}
          />
          <section>
            <Typography.Title level={3}>Метаданные Suite</Typography.Title>
            {current.suiteMetadata.length ? (
              current.suiteMetadata.map((suite) => (
                <Card
                  size="small"
                  key={`${suite.suiteId}-${suite.position}`}
                  style={{ marginBottom: 8 }}
                >
                  <Typography.Text strong>{suite.suiteTitle}</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    <strong>Предусловия:</strong>{' '}
                    <span className="plain-text">{suite.preconditions || '—'}</span>
                  </div>
                  <div>
                    <strong>Постусловия:</strong>{' '}
                    <span className="plain-text">{suite.postconditions || '—'}</span>
                  </div>
                </Card>
              ))
            ) : (
              <div className="plain-text">—</div>
            )}
          </section>
          <section>
            <Typography.Title level={3}>Описание</Typography.Title>
            <div className="plain-text">{current.description || '—'}</div>
          </section>
          <section>
            <Typography.Title level={3}>Предусловия</Typography.Title>
            <div className="plain-text">{current.preconditions || '—'}</div>
          </section>
          <section>
            <Typography.Title level={3}>Постусловия</Typography.Title>
            <div className="plain-text">{current.postconditions || '—'}</div>
          </section>
          <Typography.Title level={3}>Шаги</Typography.Title>
          {current.steps.map((step) => (
            <Card
              size="small"
              className="execution-step"
              key={step.id}
              title={`${step.position + 1}. ${step.action}`}
            >
              <div>
                <strong>Тестовые данные:</strong>{' '}
                <span className="plain-text">{step.testData || '—'}</span>
              </div>
              <div>
                <strong>Ожидаемый результат:</strong>{' '}
                <span className="plain-text">{step.expectedResult}</span>
              </div>
              <Radio.Group
                aria-label={`Статус шага ${step.position + 1}`}
                value={steps[step.id]?.status}
                onChange={(event) => patchStep(step.id, { status: event.target.value })}
                optionType="button"
                disabled={disabled}
                options={[
                  { value: TestResultStatus.Passed, label: 'Пройден' },
                  { value: TestResultStatus.Failed, label: 'Провален' },
                  { value: TestResultStatus.Blocked, label: 'Блокирован' },
                  { value: TestResultStatus.Skipped, label: 'Пропущен' },
                ]}
              />
              <Input.TextArea
                aria-label={`Фактический результат шага ${step.position + 1}`}
                placeholder="Фактический результат"
                value={steps[step.id]?.actualResult}
                onChange={(event) => patchStep(step.id, { actualResult: event.target.value })}
                disabled={disabled}
                rows={2}
              />
            </Card>
          ))}
        </main>
        <ResultSubmitPanel
          runId={runId}
          runCaseId={current.id}
          stepResults={stepResults}
          attachmentIds={attachmentIds}
          attachmentControl={
            <AttachmentUploader
              workspaceId={workspaceId}
              disabled={disabled}
              onChange={setAttachmentIds}
            />
          }
          disabled={disabled}
          onSubmitted={() => {
            sessionStorage.removeItem(`daevox.step-draft.${current.id}`);
            setSteps({});
            if (nextUntested) onSelect(nextUntested.id);
          }}
        />
      </div>
    </div>
  );
}
