export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'];
export function validateAttachment(file: Pick<File, 'size' | 'type' | 'name'>): string | null {
  if (!file.name.trim()) return 'У файла нет имени.';
  if (file.size <= 0) return 'Файл пуст.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Максимальный размер файла — 25 МБ.';
  if (!allowed.includes(file.type)) return 'Разрешены PNG, JPEG, WebP, PDF и текстовые файлы.';
  return null;
}
export function isSafeUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}
