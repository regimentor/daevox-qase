import {
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client/react';
import { App, Button, Dropdown, Form, Input, Modal, Space, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import {
  CreateSuiteDocument,
  DeleteSuiteDocument,
  MoveSuiteDocument,
  SuiteTreeDocument,
  UpdateSuiteDocument,
} from '@/shared/api/graphql';
import { toFrontendError } from '@/shared/lib/errors';
import { ErrorState, PageSkeleton } from '@/shared/ui';

type SuiteNode = {
  id: string;
  parentId: string | null;
  title: string;
  children?: readonly SuiteNode[];
};

function toNodes(
  suites: readonly SuiteNode[],
  disabled: boolean,
  onRename: (suite: SuiteNode) => void,
  onDelete: (suite: SuiteNode) => void,
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
            width: '100%',
          }}
        >
          <Typography.Text ellipsis>{suite.title}</Typography.Text>
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: 'rename',
                  label: 'Переименовать',
                  icon: <EditOutlined />,
                  disabled,
                },
                {
                  key: 'delete',
                  label: 'Удалить',
                  icon: <DeleteOutlined />,
                  danger: true,
                  disabled,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'rename') onRename(suite);
                if (key === 'delete') onDelete(suite);
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
      icon: <FolderOutlined />,
      children: toNodes(suite.children ?? [], disabled, onRename, onDelete),
    }));
}

export function SuiteTree({
  projectId,
  selected,
  disabled,
  onSelect,
}: {
  projectId: string;
  selected?: string;
  disabled?: boolean;
  onSelect(id?: string): void;
}) {
  const { message } = App.useApp();
  const [parentId, setParentId] = useState<string | null>();
  const [renaming, setRenaming] = useState<SuiteNode>();
  const [deleting, setDeleting] = useState<SuiteNode>();
  const [form] = Form.useForm<{ title: string }>();
  const [renameForm] = Form.useForm<{ title: string }>();
  const query = useQuery(SuiteTreeDocument, { variables: { projectId } });
  const [create, createState] = useMutation(CreateSuiteDocument, {
    refetchQueries: [SuiteTreeDocument],
  });
  const [update, updateState] = useMutation(UpdateSuiteDocument);
  const [remove, removeState] = useMutation(DeleteSuiteDocument);
  const [move] = useMutation(MoveSuiteDocument);

  useEffect(() => {
    if (renaming) renameForm.setFieldsValue({ title: renaming.title });
  }, [renameForm, renaming]);

  const actionDisabled = Boolean(disabled || updateState.loading || removeState.loading);
  const openRename = (suite: SuiteNode) => setRenaming(suite);
  const openDelete = (suite: SuiteNode) => setDeleting(suite);
  const nodes = useMemo(
    () => [
      {
        key: 'all',
        title: 'Все тест-кейсы',
        children: toNodes(
          (query.data?.suiteTree ?? []) as readonly SuiteNode[],
          actionDisabled,
          openRename,
          openDelete,
        ),
      },
    ],
    [actionDisabled, query.data],
  );

  if (query.loading && !query.data) return <PageSkeleton rows={8} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const createSuite = async ({ title }: { title: string }) => {
    try {
      await create({
        variables: { projectId, title: title.trim(), parentId: parentId || null, position: null },
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
      await update({ variables: { id: renaming.id, title: title.trim() } });
      await query.refetch();
      setRenaming(undefined);
      renameForm.resetFields();
      void message.success('Suite переименован');
    } catch (error) {
      void message.error(toFrontendError(error).message);
    }
  };

  const deleteSuite = async () => {
    if (!deleting) return;
    const suite = deleting;
    try {
      await remove({ variables: { id: suite.id } });
      await query.refetch();
      setDeleting(undefined);
      if (selected === suite.id) onSelect(suite.parentId ?? undefined);
      void message.success('Suite удалён');
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
          disabled={disabled}
          menu={{
            items: [{ key: 'root', label: 'Новый корневой suite', icon: <FolderAddOutlined /> }],
            onClick: () => setParentId(null),
          }}
        >
          <Button size="small" type="text" aria-label="Действия со suite" icon={<MoreOutlined />} />
        </Dropdown>
      </Space>
      <Tree
        blockNode
        showIcon
        defaultExpandedKeys={['all']}
        draggable={!disabled}
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
        title="Удалить suite?"
        open={Boolean(deleting)}
        onCancel={() => setDeleting(undefined)}
        onOk={() => void deleteSuite()}
        okText="Удалить"
        cancelText="Отмена"
        okButtonProps={{ danger: true, loading: removeState.loading }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          Удалить suite «{deleting?.title}»? Suite можно удалить только если в нём нет тестов и
          дочерних suites.
        </Typography.Paragraph>
      </Modal>
    </section>
  );
}
