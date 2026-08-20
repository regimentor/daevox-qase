import type { Meta, StoryObj } from '@storybook/react-vite';
import { graphql, http, HttpResponse } from 'msw';
import { fn, userEvent, within } from 'storybook/test';
import { AttachmentUploader } from '@/features/attachment-upload';
const ready = {
  id: 'attachment-1',
  workspaceId: 'workspace-1',
  uploadedBy: 'user-1',
  filename: 'evidence.png',
  mimeType: 'image/png',
  size: '4',
  status: 'READY',
  downloadUrl: null,
  createdAt: '2026-08-20T00:00:00Z',
  updatedAt: '2026-08-20T00:00:00Z',
};
const handlers = [
  graphql.mutation('PresignAttachmentUpload', () =>
    HttpResponse.json({
      data: {
        presignAttachmentUpload: {
          attachment: { ...ready, status: 'PENDING' },
          url: 'http://localhost/upload/1',
          method: 'PUT',
          headers: [],
          expiresAt: '2026-08-20T01:00:00Z',
        },
      },
    }),
  ),
  http.put('http://localhost/upload/1', () => new HttpResponse(null, { status: 200 })),
  graphql.mutation('CompleteAttachmentUpload', () =>
    HttpResponse.json({ data: { completeAttachmentUpload: ready } }),
  ),
];
const meta = {
  title: 'Execution/Attachment uploader',
  component: AttachmentUploader,
  args: { workspaceId: 'workspace-1', onChange: fn() },
  parameters: { msw: handlers },
} satisfies Meta<typeof AttachmentUploader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const UploadSuccess: Story = {
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type=file]');
    if (input)
      await userEvent.upload(input, new File(['test'], 'evidence.png', { type: 'image/png' }));
  },
};
export const PermissionRestricted: Story = { args: { disabled: true } };
export const InvalidFile: Story = {
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('File input unavailable');
    await userEvent.upload(
      input,
      new File(['unsafe'], 'evidence.exe', { type: 'application/x-msdownload' }),
    );
    await userEvent.click(await within(canvasElement).findByText('Повторить'));
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Удалить evidence/ }));
  },
};
export const UploadFailureAndRetry: Story = {
  parameters: {
    msw: [
      graphql.mutation('PresignAttachmentUpload', () =>
        HttpResponse.json({ errors: [{ message: 'Хранилище недоступно' }] }),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('File input unavailable');
    await userEvent.upload(input, new File(['test'], 'evidence.txt', { type: 'text/plain' }));
    await userEvent.click(await within(canvasElement).findByText('Повторить'));
  },
};
