const absolute = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : absolute.format(date);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [
    hours && `${hours} ч`,
    minutes && `${minutes} мин`,
    (!hours && rest) || seconds === 0 ? `${rest} сек` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
