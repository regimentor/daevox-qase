import { Alert, Button, Empty, Result, Skeleton } from 'antd';

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return <Skeleton active title={false} paragraph={{ rows }} aria-label="Загрузка данных" />;
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <>
          <strong>{title}</strong>
          {description && <div>{description}</div>}
        </>
      }
    >
      {action}
    </Empty>
  );
}
export function ErrorState({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  const description = typeof error === 'string' ? error : error.message;
  return (
    <Alert
      type="error"
      showIcon
      title="Не удалось загрузить данные"
      description={description}
      action={onRetry && <Button onClick={onRetry}>Повторить</Button>}
    />
  );
}
export function NotFoundState() {
  return (
    <Result
      status="404"
      title="Не найдено"
      subTitle="Объект не существует или недоступен для вашей рабочей области."
    />
  );
}
export function PermissionState() {
  return (
    <Result
      status="403"
      title="Недостаточно прав"
      subTitle="Обратитесь к администратору рабочей области."
    />
  );
}
