import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { AppProviders } from '@/app/providers';
import '@/app/styles/global.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <div className="app-boot">Загрузка Daevox QA Suite…</div>;
}

export default function Root() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Неожиданная ошибка';
  return (
    <main className="route-error" role="alert">
      <h1>Не удалось открыть страницу</h1>
      <p>{message}</p>
      <a href="/">Вернуться в начало</a>
    </main>
  );
}
