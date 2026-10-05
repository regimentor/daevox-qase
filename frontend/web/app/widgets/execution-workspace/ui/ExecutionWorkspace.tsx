import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  MinusCircleOutlined,
  PauseCircleOutlined,
  RightCircleOutlined,
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
  Tag,
  Typography,
} from 'antd';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AttachmentUploader } from '@/features/attachment-upload';
import { ResultSubmitPanel } from '@/features/result-submit';
import {
  TestResultStatus,
  type RunCaseFieldsFragment,
  type TestStepResultInput,
} from '@/shared/api/graphql';
import { getStatusLabel, PriorityTag, SeverityTag, StatusTag } from '@/shared/ui';
import { clampPercentage } from '@/shared/lib/number';
import {
  runSuiteTree,
  runCasesInTreeOrder,
  type RunNavigationNode,
} from '@/shared/lib/run-navigation';

interface StepDraft {
  status?: TestResultStatus;
  actualResult?: string;
}
const caseStatuses = ['UNTESTED', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED'] as const;
const statusColors = ['default', 'success', 'error', 'warning', 'processing'] as const;
const statusIcons = [
  <MinusCircleOutlined aria-hidden key="untested" />,
  <CheckCircleOutlined aria-hidden key="passed" />,
  <CloseCircleOutlined aria-hidden key="failed" />,
  <PauseCircleOutlined aria-hidden key="blocked" />,
  <RightCircleOutlined aria-hidden key="skipped" />,
];
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
  const orderedCases = useMemo(() => runCasesInTreeOrder(cases), [cases]);
  const suiteStats = useMemo(() => {
    const stats = new Map<string, { total: number; counts: number[] }>();
    const visit = (nodes: RunNavigationNode[]): number[] => {
      const counts = caseStatuses.map(() => 0);
      for (const node of nodes) {
        if (node.kind === 'case') {
          counts[caseStatuses.indexOf(node.item.currentStatus)]! += 1;
        } else {
          const childCounts = visit(node.children);
          stats.set(node.id, {
            total: childCounts.reduce((sum, count) => sum + count, 0),
            counts: childCounts,
          });
          childCounts.forEach((count, index) => {
            counts[index]! += count;
          });
        }
      }
      return counts;
    };
    visit(runSuiteTree(cases));
    return stats;
  }, [cases]);
  const current = orderedCases.find((item) => item.id === currentId) ?? orderedCases[0];
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const suiteIds = (nodes: RunNavigationNode[]): string[] =>
      nodes.flatMap((node) => (node.kind === 'suite' ? [node.id, ...suiteIds(node.children)] : []));
    return new Set(suiteIds(runSuiteTree(cases)));
  });
  const previousId = useRef(currentId);
  const headerRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(1320);
  const [widths, setWidths] = useState({ left: 520, right: 360 });
  const drag = useRef<{
    side: 'left' | 'right';
    pointerId: number;
    x: number;
    width: number;
  } | null>(null);
  const rightWidth = Math.max(280, Math.min(widths.right, gridWidth - 420 - 260 - 12));
  const leftWidth = Math.max(260, Math.min(widths.left, gridWidth - 420 - rightWidth - 12));
  const navId = useId();
  const resultId = useId();
  const [headerHeight, setHeaderHeight] = useState(70);
  useEffect(() => {
    const header = headerRef.current;
    const grid = gridRef.current;
    if (!header || !grid) return;
    const observer = new ResizeObserver(() => {
      setHeaderHeight(header.getBoundingClientRect().height);
      setGridWidth(grid.getBoundingClientRect().width);
    });
    observer.observe(header);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  const treeId = useId();
  const [steps, setSteps] = useState<Record<string, StepDraft>>({});
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  useEffect(() => {
    if (search || status) setCollapsed(new Set());
  }, [search, status]);
  useEffect(() => {
    if (!current || previousId.current === currentId) return;
    previousId.current = currentId;
    const ancestors = current.suiteMetadata.length
      ? current.suiteMetadata.map((suite) => suite.suiteId)
      : ['ungrouped'];
    setCollapsed((value) => new Set([...value].filter((id) => !ancestors.includes(id))));
  }, [current, currentId]);
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
  const tree = useMemo(() => {
    const filter = (nodes: RunNavigationNode[]): RunNavigationNode[] =>
      nodes.flatMap<RunNavigationNode>((node) => {
        if (node.kind === 'case') {
          const item = node.item;
          return (!status || item.currentStatus === status) &&
            (!search ||
              `${item.displayId} ${item.title}`.toLowerCase().includes(search.toLowerCase()))
            ? [node]
            : [];
        }
        const children = filter(node.children);
        return children.length ? [{ ...node, children }] : [];
      });
    return filter(runSuiteTree(cases));
  }, [cases, search, status]);
  const renderNodes = (nodes: RunNavigationNode[]) =>
    nodes.map((node) => (
      <li key={node.id}>
        {node.kind === 'suite' ? (
          <>
            <button
              type="button"
              className="navigator-suite"
              aria-expanded={!collapsed.has(node.id)}
              aria-controls={`${treeId}-${node.id}`}
              onClick={() =>
                setCollapsed((value) => {
                  const next = new Set(value);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                })
              }
            >
              {node.title}
            </button>
            <div
              className="navigator-suite-stats"
              role="group"
              aria-label={`Статистика сьюта ${node.title}`}
            >
              <span>Кейсов: {suiteStats.get(node.id)!.total}</span>
              {caseStatuses.map((value, index) => {
                const label = `${getStatusLabel(value)}: ${suiteStats.get(node.id)!.counts[index]}`;
                return (
                  <Tag
                    key={value}
                    color={statusColors[index]}
                    icon={statusIcons[index]}
                    aria-label={label}
                    title={label}
                  >
                    {suiteStats.get(node.id)!.counts[index]}
                  </Tag>
                );
              })}
            </div>
            <ul id={`${treeId}-${node.id}`} aria-label={node.title} hidden={collapsed.has(node.id)}>
              {renderNodes(node.children)}
            </ul>
          </>
        ) : (
          <button
            type="button"
            className={`navigator-item ${node.id === currentId ? 'active' : ''}`}
            aria-current={node.id === currentId ? 'true' : undefined}
            onClick={() => onSelect(node.id)}
          >
            <StatusTag status={node.item.currentStatus} />
            <span>
              <strong className="mono-id">{node.item.displayId}</strong>
              <small>{node.item.title}</small>
            </span>
          </button>
        )}
      </li>
    ));
  if (!current) return <Card>В запуске нет кейсов.</Card>;
  const index = orderedCases.findIndex((item) => item.id === current.id);
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
    orderedCases.find(
      (item, itemIndex) => itemIndex > index && item.currentStatus === 'UNTESTED',
    ) ?? orderedCases.find((item) => item.currentStatus === 'UNTESTED');
  const resizeHandle = (side: 'left' | 'right') => {
    const minimum = side === 'left' ? 260 : 280;
    const maximum = Math.max(
      minimum,
      gridWidth - 420 - 12 - (side === 'left' ? rightWidth : leftWidth),
    );
    const width = side === 'left' ? leftWidth : rightWidth;
    return (
      <div
        role="separator"
        className="execution-resizer"
        tabIndex={0}
        aria-label={side === 'left' ? 'Ширина списка кейсов' : 'Ширина результата попытки'}
        aria-controls={side === 'left' ? navId : resultId}
        aria-orientation="vertical"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={width}
        onPointerDown={(event) => {
          if (event.button !== 0 || gridWidth <= 1023) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { side, pointerId: event.pointerId, x: event.clientX, width };
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.side !== side || active.pointerId !== event.pointerId) return;
          const next = active.width + (event.clientX - active.x) * (side === 'left' ? 1 : -1);
          setWidths((value) => ({ ...value, [side]: Math.max(minimum, Math.min(maximum, next)) }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const direction = side === 'left' ? 1 : -1;
          const next =
            event.key === 'Home'
              ? minimum
              : event.key === 'End'
                ? maximum
                : event.key === 'ArrowRight'
                  ? width + direction * 20
                  : event.key === 'ArrowLeft'
                    ? width - direction * 20
                    : undefined;
          if (next === undefined) return;
          event.preventDefault();
          setWidths((value) => ({ ...value, [side]: Math.max(minimum, Math.min(maximum, next)) }));
        }}
      />
    );
  };
  return (
    <div
      className="execution-shell"
      style={{ '--execution-header-height': `${headerHeight}px` } as React.CSSProperties}
    >
      <header ref={headerRef} className="execution-header">
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
      <div
        ref={gridRef}
        className="execution-grid"
        style={{ gridTemplateColumns: `${leftWidth}px 6px minmax(420px, 1fr) 6px ${rightWidth}px` }}
      >
        <nav id={navId} className="case-navigator" aria-label="Кейсы запуска">
          <Input
            aria-label="Поиск кейсов запуска"
            prefix={<SearchOutlined />}
            placeholder="Поиск"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            aria-label="Фильтр кейсов запуска по статусу"
            virtual={false}
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
            {tree.length ? (
              <ul aria-label="Сьюты запуска">{renderNodes(tree)}</ul>
            ) : (
              <Typography.Text type="secondary">Кейсы не найдены</Typography.Text>
            )}
          </div>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              disabled={index <= 0}
              onClick={() => onSelect(orderedCases[index - 1]!.id)}
            >
              Назад
            </Button>
            <Button
              icon={<ArrowRightOutlined />}
              disabled={index >= cases.length - 1}
              onClick={() => onSelect(orderedCases[index + 1]!.id)}
            >
              Далее
            </Button>
          </Space>
        </nav>
        {resizeHandle('left')}
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
        {resizeHandle('right')}
        <div id={resultId} className="execution-result">
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
    </div>
  );
}
