import {
  AppstoreOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@apollo/client/react';
import {
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Layout,
  Menu,
  Select,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ProjectsDocument, WorkspacesDocument } from '@/shared/api/graphql';
import { routes } from '@/shared/routes';

const { Header, Sider, Content } = Layout;
export function AppShell({
  workspaceId,
  projectId,
  user,
  onLogout,
}: {
  workspaceId: string;
  projectId: string;
  user: { name: string; email: string };
  onLogout(): Promise<void>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: workspaceData, loading: workspacesLoading } = useQuery(WorkspacesDocument, {
    variables: { page: { limit: 100, offset: 0 } },
  });
  const { data: projectData, loading: projectsLoading } = useQuery(ProjectsDocument, {
    variables: { workspaceId, page: { limit: 100, offset: 0 } },
  });
  useEffect(() => {
    const query = matchMedia('(max-width: 1023px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const items = useMemo(
    () => [
      {
        key: routes.dashboard(workspaceId, projectId),
        icon: <DashboardOutlined />,
        label: 'Обзор',
      },
      {
        key: routes.repository(workspaceId, projectId),
        icon: <DatabaseOutlined />,
        label: 'Repository',
      },
      {
        key: routes.plans(workspaceId, projectId),
        icon: <UnorderedListOutlined />,
        label: 'Планы',
      },
      { key: routes.runs(workspaceId, projectId), icon: <PlayCircleOutlined />, label: 'Запуски' },
      {
        key: routes.environments(workspaceId, projectId),
        icon: <ExperimentOutlined />,
        label: 'Окружения',
      },
      { key: routes.members(workspaceId), icon: <SettingOutlined />, label: 'Участники workspace' },
    ],
    [workspaceId, projectId],
  );
  const navigation = (
    <Menu
      mode="inline"
      selectedKeys={[items.find((item) => location.pathname.startsWith(item.key))?.key ?? '']}
      items={items}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
    />
  );
  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Space size={12} className="brand">
          <AppstoreOutlined />
          <Typography.Text strong>Daevox</Typography.Text>
        </Space>
        {mobile && (
          <Button
            type="text"
            aria-label="Открыть навигацию"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
          />
        )}
        <Select
          aria-label="Рабочее пространство"
          showSearch
          optionFilterProp="label"
          loading={workspacesLoading}
          value={workspaceId}
          className="context-select"
          options={workspaceData?.workspaces.items.map((item) => ({
            value: item.id,
            label: item.name,
          }))}
          onChange={(id) => navigate(routes.workspace(id))}
        />
        <Select
          aria-label="Проект"
          showSearch
          optionFilterProp="label"
          loading={projectsLoading}
          value={projectId}
          className="context-select"
          options={projectData?.projects.items.map((item) => ({
            value: item.id,
            label: `${item.code} · ${item.name}`,
          }))}
          onChange={(id) => navigate(routes.dashboard(workspaceId, id))}
        />
        <div className="header-spacer" />
        <Dropdown
          menu={{
            items: [
              { key: 'email', label: user.email, disabled: true },
              { type: 'divider' },
              { key: 'logout', label: 'Выйти', danger: true },
            ],
            onClick: ({ key }) => key === 'logout' && void onLogout(),
          }}
          trigger={['click']}
        >
          <Button type="text" aria-label="Меню пользователя">
            <Avatar size="small" icon={<UserOutlined />} />{' '}
            <span className="user-name">{user.name}</span>
          </Button>
        </Dropdown>
      </Header>
      <Layout>
        {!mobile && (
          <Sider
            width={232}
            collapsedWidth={64}
            collapsed={collapsed}
            theme="light"
            className="app-sider"
          >
            {navigation}
            <Tooltip title={collapsed ? 'Развернуть' : 'Свернуть'}>
              <Button
                type="text"
                className="collapse-button"
                aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
                icon={<MenuFoldOutlined rotate={collapsed ? 180 : 0} />}
                onClick={() => setCollapsed((value) => !value)}
              />
            </Tooltip>
          </Sider>
        )}
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
      <Drawer
        title="Навигация"
        placement="left"
        size={280}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        {navigation}
      </Drawer>
    </Layout>
  );
}
