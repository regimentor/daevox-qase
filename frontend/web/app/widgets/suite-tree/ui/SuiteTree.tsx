import { FolderAddOutlined, FolderOutlined, MoreOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client/react';
import { App, Button, Dropdown, Form, Input, Modal, Space, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState } from 'react';
import {
  CreateSuiteDocument,
  MoveSuiteDocument,
  SuiteTreeDocument,
  type SuiteFieldsFragment,
} from '@/shared/api/graphql';
import { ErrorState, PageSkeleton } from '@/shared/ui';
import { toFrontendError } from '@/shared/lib/errors';

function toNodes(suites: readonly SuiteFieldsFragment[]): DataNode[] {
  return suites
    .filter((suite) => Boolean(suite.id))
    .map((suite) => ({
      key: suite.id,
      title: suite.title,
      icon: <FolderOutlined />,
      children: toNodes((suite.children ?? []) as SuiteFieldsFragment[]),
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
  const [form] = Form.useForm<{ title: string }>();
  const query = useQuery(SuiteTreeDocument, { variables: { projectId } });
  const [create, createState] = useMutation(CreateSuiteDocument, {
    refetchQueries: [SuiteTreeDocument],
  });
  const [move] = useMutation(MoveSuiteDocument);
  const nodes = useMemo(
    () => [{ key: 'all', title: 'Все тест-кейсы', children: toNodes(query.data?.suiteTree ?? []) }],
    [query.data],
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
        <Form form={form} layout="vertical" onFinish={createSuite}>
          <Form.Item label="Название" name="title" rules={[{ required: true, whitespace: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={createState.loading}>
            Создать
          </Button>
        </Form>
      </Modal>
    </section>
  );
}
