import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: process.env.GRAPHQL_SCHEMA ?? '../../backend/api/src/schema/schema.graphql',
  documents: ['app/**/*.graphql'],
  generates: {
    'app/shared/api/graphql/generated.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
      config: {
        avoidOptionals: true,
        arrayInputCoercion: false,
        defaultScalarType: 'unknown',
        scalars: { UUID: 'string', DateTime: 'string', BigInt: 'string' },
        useTypeImports: true,
      },
    },
  },
  ignoreNoDocuments: false,
};

export default config;
