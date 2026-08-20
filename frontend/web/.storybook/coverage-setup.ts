import { afterAll } from 'vitest';

afterAll(async () => {
  const coverage = Reflect.get(globalThis, '__coverage__');
  if (!coverage || !import.meta.env.VITE_COVERAGE) return;
  await fetch('/__coverage__', {
    method: 'POST',
    headers: { accept: 'msw/passthrough', 'content-type': 'application/json' },
    body: JSON.stringify(coverage),
  });
});
