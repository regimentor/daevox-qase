import { InboxOutlined } from '@ant-design/icons';
import { useMutation } from '@apollo/client/react';
import { App, Button } from 'antd';
import { ArchiveProjectDocument, ProjectContextDocument } from '@/shared/api/graphql';
import { toFrontendError } from '@/shared/lib/errors';

export function ArchiveProjectButton({
  projectId,
  projectName,
  disabled,
}: {
  projectId: string;
  projectName: string;
  disabled?: boolean;
}) {
  const { message, modal } = App.useApp();
  const [archive, { loading }] = useMutation(ArchiveProjectDocument, {
    refetchQueries: [{ query: ProjectContextDocument, variables: { id: projectId } }],
  });
  const confirm = () =>
    modal.confirm({
      title: `Архивировать «${projectName}»?`,
      content:
        'Repository, планы и настройки станут доступны только для чтения. История запусков сохранится.',
      okText: 'Архивировать',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await archive({ variables: { id: projectId } });
          void message.success('Проект архивирован');
        } catch (error) {
          void message.error(toFrontendError(error).message);
        }
      },
    });
  return (
    <Button danger icon={<InboxOutlined />} disabled={disabled} loading={loading} onClick={confirm}>
      Архивировать
    </Button>
  );
}
