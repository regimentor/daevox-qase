import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

interface Instrumenter {
  instrumentSync(code: string, filename: string): string;
  lastSourceMap(): {
    version: number;
    sources: string[];
    names: string[];
    mappings: string;
    file?: string;
    sourcesContent?: string[];
  } | null;
}

const { createInstrumenter } = createRequire(import.meta.url)('istanbul-lib-instrument') as {
  createInstrumenter(options: Record<string, unknown>): Instrumenter;
};

export function sourceCoveragePlugin(): Plugin {
  const instrumenter = createInstrumenter({
    autoWrap: true,
    compact: false,
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
    esModules: true,
    parserPlugins: ['typescript', 'jsx'],
    preserveComments: true,
    produceSourceMap: true,
  });
  return {
    name: 'daevox-source-coverage',
    enforce: 'pre',
    transform(code, rawId) {
      const id = rawId.split('?')[0]?.replaceAll('\\', '/');
      if (
        !id ||
        !id.includes('/frontend/web/app/') ||
        !/\.(?:ts|tsx)$/.test(id) ||
        /\.(?:stories|test)\./.test(id) ||
        id.endsWith('/shared/api/graphql/generated.ts') ||
        id.includes('/shared/test/') ||
        id.endsWith('/index.ts') ||
        id.endsWith('/app/root.tsx') ||
        id.endsWith('/app/routes.ts')
      )
        return;
      const result = instrumenter.instrumentSync(code, id);
      return { code: result, map: instrumenter.lastSourceMap() };
    },
  };
}
