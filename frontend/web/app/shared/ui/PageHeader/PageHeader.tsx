import { Space, Typography } from 'antd';

export function PageHeader({
  title,
  description,
  extra,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <Typography.Title level={2}>{title}</Typography.Title>
        {description && <Typography.Text type="secondary">{description}</Typography.Text>}
      </div>
      <Space>{extra}</Space>
    </header>
  );
}
