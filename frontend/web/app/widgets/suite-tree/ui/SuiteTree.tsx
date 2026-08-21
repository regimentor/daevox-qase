import {
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOutlined,
  MoreOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import { App, Button, Dropdown, Form, Input, Modal, Space, Tag, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import {
  ArchiveSuiteDocument,
  CreateSuiteDocument,
  MoveSuiteDocument,
  RestoreSuiteDocument,
  SuiteArchivePreviewDocument,
  SuiteTreeDocument,
  UpdateSuiteDocument,
} from '@/shared/api/graphql';
import { toFrontendError } from '@/shared/lib/errors';
import { ErrorState, PageSkeleton } from '@/shared/ui';

type SuiteNode = {
  id: string;
  parentId: string | null;
  title: string;
  description?: string | null;
  preconditions?: string | null;
  postconditions?: string | null;
  archivedAt?: string | null;
  children?: readonly SuiteNode[];
};

type ArchiveConfirmation = {
  suite: SuiteNode;
  suiteCount: number;
  caseCount: number;
  affectedPlans: Array<{ title: string; affectedCaseCount: number }>;
};

function toNodes(
  suites: readonly SuiteNode[],
  disabled: boolean,
  onRename: (suite: SuiteNode) => void,
  onArchive: (suite: SuiteNode) => void,
  onRestore: (suite: SuiteNode) => void,
): DataNode[] {
  return suites
    .filter((suite) => Boolean(suite.id))
    .map((suite) => ({
      key: suite.id,
      title: (
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
            minWidth: 0,
            width: '100%',
          }}
        >
          <FolderOutlined aria-hidden />
          <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
            {suite.title} {suite.archivedAt && <Tag>Архив</Tag>}
          </Typography.Text>
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: suite.archivedAt
                ? [{ key: 'restore', label: 'Восстановить', icon: <RollbackOutlined />, disabled }]
                : [
                    { key: 'rename', label: 'Переименовать', icon: <EditOutlined />, disabled },
                    {
                      key: 'archive',
                      label: 'Архивировать',
                      icon: <DeleteOutlined />,
                      danger: true,
                      disabled,
                    },
                  ],
              onClick: ({ key }) => {
                if (key === 'rename') onRename(suite);
                if (key === 'archive') onArchive(suite);
                if (key === 'restore') onRestore(suite);
              },
            }}
          >
            <Button
              type="text"
              size="small"
              aria-label={`Действия для suite ${suite.title}`}
              icon={<MoreOutlined />}
              onClick={(event) => event.stopPropagation()}
            />
          </Dropdown>
        </div>
      ),
      children: toNodes(suite.children ?? [], disabled, onRename, onArchive, onRestore),
    }));
}

export function SuiteTree({
  projectId,
  selected,
  disabled,
  includeArchived = false,
  onSelect,
}: {
  projectId: string;
  selected?: string;
  disabled?: boolean;
  includeArchived?: boolean;
  onSelect(id?: string): void;
}) {
  const { message } = App.useApp();
  const [parentId, setParentId] = useState<string | null>();
  const [renaming, setRenaming] = useState<SuiteNode>();
  const [archiving, setArchiving] = useState<ArchiveConfirmation>();
  const [form] = Form.useForm<{
    title: string;
    description?: string;
    preconditions?: string;
    postconditions?: string;
  }>();
  const [renameForm] = Form.useForm<{ title: string }>();
  const query = useQuery(SuiteTreeDocument, { variables: { projectId, includeArchived } });
  const [preview] = useLazyQuery(SuiteArchivePreviewDocument);
  const [create, createState] = useMutation(CreateSuiteDocument, {
    refetchQueries: [SuiteTreeDocument],
  });
  const [update, updateState] = useMutation(UpdateSuiteDocument);
  const [archive, archiveState] = useMutation(ArchiveSuiteDocument);
  const [restore, restoreState] = useMutation(RestoreSuiteDocument);
  const [move] = useMutation(MoveSuiteDocument);

  useEffect(() => {
    if (renaming) renameForm.setFieldsValue({ title: renaming.title });
  }, [renameForm, renaming]);

  const actionDisabled = Boolean(
    disabled || updateState.loading || archiveState.loading || restoreState.loading,
  );
  const openRename = (suite: SuiteNode) => setRenaming(suite);
  const openArchive = async (suite: SuiteNode) => {
    try {
      const result = await preview({ variables: { id: suite.id } });
      const impact = result.data?.suiteArchivePreview;
      if (impact) setArchiving({ suite, ...impact });
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };
  const openRestore = async (suite: SuiteNode) => {
    try {
      await restore({ variables: { id: suite.id } });
      await query.refetch();
      onSelect(suite.id);
      void message.success('Suite восстановлен');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };
  const nodes = useMemo(
    () => [
      {
        key: 'all',
        title: 'Все тест-кейсы',
        children: toNodes(
          (query.data?.suiteTree ?? []) as readonly SuiteNode[],
          actionDisabled,
          openRename,
          openArchive,
          openRestore,
        ),
      },
    ],
    [actionDisabled, query.data],
  );

  if (query.loading && !query.data) return <PageSkeleton rows={8} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const createSuite = async (values: {
    title: string;
    description?: string;
    preconditions?: string;
    postconditions?: string;
  }) => {
    try {
      await create({
        variables: {
          projectId,
          title: values.title.trim(),
          parentId: parentId || null,
          description: values.description?.trim() || null,
          preconditions: values.preconditions?.trim() || null,
          postconditions: values.postconditions?.trim() || null,
          position: null,
        },
      });
      setParentId(undefined);
      form.resetFields();
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };

  const renameSuite = async ({ title }: { title: string }) => {
    if (!renaming) return;
    try {
      await update({
        variables: {
          id: renaming.id,
          input: {
            title: title.trim(),
            description: renaming.description ?? null,
            preconditions: renaming.preconditions ?? null,
            postconditions: renaming.postconditions ?? null,
          },
        },
      });
      await query.refetch();
      setRenaming(undefined);
      renameForm.resetFields();
      void message.success('Suite переименован');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };

  const archiveSuite = async () => {
    if (!archiving) return;
    try {
      await archive({ variables: { id: archiving.suite.id } });
      await query.refetch();
      setArchiving(undefined);
      if (selected === archiving.suite.id) onSelect(archiving.suite.parentId ?? undefined);
      void message.success('Suite архивирован');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };

  const drop = async (info: {
    node: DataNode;
    dragNode: DataNode;
    dropPosition: number;
    dropToGap: boolean;
  }) => {
    if (info.dragNode.key === 'all') return;
    const newParent = info.dropToGap
      ? null
      : info.node.key === 'all'
        ? null
        : String(info.node.key);
    try {
      await move({
        variables: {
          suiteId: String(info.dragNode.key),
          parentId: newParent,
          position: Math.max(0, info.dropPosition),
        },
        refetchQueries: [SuiteTreeDocument],
      });
    } catch (error) {
      void message.error(`${toFrontendError(error).message} Порядок восстановлен.`);
      await query.refetch();
    }
  };

  return (
    <section aria-label="Дерево тест-сьютов">
      <Space className="suite-tree-heading">
        <Typography.Text strong>Test suites</Typography.Text>
        <Dropdown
          disabled={disabled || includeArchived}
          menu={{
            items: [{ key: 'root', label: 'Новый корневой suite', icon: <FolderAddOutlined /> }],
            onClick: () => setParentId(null),
          }}
        >
          <Button size="small" type="text" aria-label="Действия со suite" icon={<MoreOutlined />} />
        </Dropdown>
      </Space>
      <Tree
        className="suite-tree"
        blockNode
        defaultExpandedKeys={['all']}
        draggable={!disabled && !includeArchived}
        treeData={nodes}
        selectedKeys={[selected ?? 'all']}
        onSelect={(keys) => onSelect(keys[0] === 'all' ? undefined : String(keys[0]))}
        onDrop={(info) => void drop(info)}
      />
      <Modal
        title="Новый test suite"
        open={parentId !== undefined}
        onCancel={() => setParentId(undefined)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={createSuite} disabled={createState.loading}>
          <Form.Item label="Название" name="title" rules={[{ required: true, whitespace: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="Описание" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Предусловия" name="preconditions">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Постусловия" name="postconditions">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={createState.loading}>
            Создать
          </Button>
        </Form>
      </Modal>
      <Modal
        title="Переименовать suite"
        open={Boolean(renaming)}
        onCancel={() => setRenaming(undefined)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={renameForm}
          layout="vertical"
          onFinish={renameSuite}
          disabled={updateState.loading}
        >
          <Form.Item label="Название" name="title" rules={[{ required: true, whitespace: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={updateState.loading}>
            Сохранить
          </Button>
        </Form>
      </Modal>
      <Modal
        title="Архивировать suite?"
        open={Boolean(archiving)}
        onCancel={() => setArchiving(undefined)}
        onOk={() => void archiveSuite()}
        okText="Архивировать"
        cancelText="Отмена"
        okButtonProps={{ danger: true, loading: archiveState.loading }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          Suite «{archiving?.suite.title}» и её поддерево: suites — {archiving?.suiteCount}, кейсы —{' '}
          {archiving?.caseCount}.
        </Typography.Paragraph>
        {archiving?.affectedPlans.length ? (
          <Typography.Paragraph>
            Затронутые планы:{' '}
            {archiving.affectedPlans
              .map((plan) => `${plan.title} (${plan.affectedCaseCount})`)
              .join(', ')}
          </Typography.Paragraph>
        ) : null}
      </Modal>
    </section>
  );
}
