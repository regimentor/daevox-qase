import {
  CloseOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation } from '@apollo/client/react';
import { Alert, Button, Progress, Space, Typography, Upload } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  CompleteAttachmentUploadDocument,
  DeleteAttachmentDocument,
  PresignAttachmentUploadDocument,
  type AttachmentFieldsFragment,
} from '@/shared/api/graphql';
import { toFrontendError } from '@/shared/lib/errors';
import { isSafeUploadUrl, validateAttachment } from '../model/validation';
interface UploadItem {
  key: string;
  file: File;
  progress: number;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
  attachment?: AttachmentFieldsFragment;
}
export function AttachmentUploader({
  workspaceId,
  disabled,
  onChange,
}: {
  workspaceId: string;
  disabled?: boolean;
  onChange(ids: string[]): void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const [presign] = useMutation(PresignAttachmentUploadDocument);
  const [complete] = useMutation(CompleteAttachmentUploadDocument);
  const [remove] = useMutation(DeleteAttachmentDocument);
  useEffect(() => {
    onChange(
      items.flatMap((item) =>
        item.status === 'ready' && item.attachment ? [item.attachment.id] : [],
      ),
    );
  }, [items, onChange]);
  const emit = (next: UploadItem[]) => {
    setItems(next);
  };
  const patchItem = (key: string, patch: Partial<UploadItem>) =>
    setItems((current) => {
      const next = current.map((item) => (item.key === key ? { ...item, ...patch } : item));
      return next;
    });
  const upload = async (file: File, reuseKey?: string) => {
    const validation = validateAttachment(file);
    const key = reuseKey ?? `${file.name}-${file.size}-${file.lastModified}`;
    if (validation) {
      if (reuseKey) patchItem(key, { status: 'error', error: validation });
      else emit([...items, { key, file, progress: 0, status: 'error', error: validation }]);
      return;
    }
    if (reuseKey) patchItem(key, { status: 'uploading', progress: 0, error: undefined });
    else setItems((current) => [...current, { key, file, progress: 0, status: 'uploading' }]);
    try {
      const prepared = await presign({
        variables: {
          workspaceId,
          filename: file.name,
          mimeType: file.type,
          size: String(file.size),
        },
      });
      const payload = prepared.data?.presignAttachmentUpload;
      if (!payload || !isSafeUploadUrl(payload.url))
        throw new Error('Сервер вернул небезопасный URL загрузки.');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        requests.current.set(key, xhr);
        xhr.open(payload.method, payload.url);
        for (const header of payload.headers) xhr.setRequestHeader(header.name, header.value);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            patchItem(key, { progress: Math.round((event.loaded / event.total) * 100) });
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Сетевая ошибка загрузки.'));
        xhr.onabort = () => reject(new DOMException('Отменено', 'AbortError'));
        xhr.send(file);
      });
      const result = await complete({ variables: { id: payload.attachment.id } });
      if (!result.data) throw new Error('Не удалось подтвердить загрузку.');
      patchItem(key, {
        status: 'ready',
        progress: 100,
        attachment: result.data.completeAttachmentUpload,
      });
    } catch (reason) {
      const text =
        reason instanceof DOMException && reason.name === 'AbortError'
          ? 'Загрузка отменена.'
          : toFrontendError(reason).message;
      patchItem(key, { status: 'error', error: text });
    } finally {
      requests.current.delete(key);
    }
  };
  const deleteItem = async (item: UploadItem) => {
    requests.current.get(item.key)?.abort();
    if (item.attachment) {
      try {
        await remove({ variables: { id: item.attachment.id } });
      } catch (error) {
        patchItem(item.key, { status: 'error', error: toFrontendError(error).message });
        return;
      }
    }
    emit(items.filter((entry) => entry.key !== item.key));
  };
  return (
    <section aria-label="Вложения">
      <Upload.Dragger
        disabled={disabled}
        multiple
        showUploadList={false}
        beforeUpload={(file) => {
          void upload(file);
          return Upload.LIST_IGNORE;
        }}
      >
        <p className="ant-upload-drag-icon">
          <UploadOutlined />
        </p>
        <p>Перетащите подтверждение или выберите файл</p>
        <Typography.Text type="secondary">PNG, JPEG, WebP, PDF, TXT · до 25 МБ</Typography.Text>
      </Upload.Dragger>
      {items.length > 0 && (
        <div className="attachment-list" role="list" aria-label="Загружаемые вложения">
          {items.map((item) => (
            <div className="attachment-list-item" role="listitem" key={item.key}>
              <PaperClipOutlined aria-hidden />
              <div className="attachment-list-content">
                <Typography.Text strong>{item.file.name}</Typography.Text>
                {item.status === 'uploading' && (
                  <Progress
                    percent={item.progress}
                    size="small"
                    aria-label={`Загрузка ${item.file.name}: ${item.progress}%`}
                  />
                )}
                {item.status === 'ready' && (
                  <Typography.Text type="success">Готово</Typography.Text>
                )}
                {item.error && <Alert type="error" title={item.error} />}
              </div>
              <Space>
                {item.status === 'error' && (
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    onClick={() => void upload(item.file, item.key)}
                  >
                    Повторить
                  </Button>
                )}
                <Button
                  type="text"
                  danger
                  icon={<CloseOutlined />}
                  aria-label={`Удалить ${item.file.name}`}
                  onClick={() => void deleteItem(item)}
                />
              </Space>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
