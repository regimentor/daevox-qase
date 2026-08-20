import { GraphQLDefinitionsFactory } from '@nestjs/graphql';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const factory = new GraphQLDefinitionsFactory();
await factory.generate({
  typePaths: [resolve(root, 'schema.graphql')],
  path: resolve(root, '../generated/graphql.ts'),
  outputAs: 'interface',
  emitTypenameField: true,
});
