import { buildSchema, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';

import { queryProtectionRule } from '../src/schema/protection.js';

describe('GraphQL query protection', () => {
  const schema = buildSchema('type Query { value: String, nested: Query }');

  it('rejects excessive aliases', () => {
    const aliases = Array.from({ length: 21 }, (_, index) => `a${index}: value`).join(' ');
    const errors = validate(schema, parse(`query { ${aliases} }`), [queryProtectionRule]);
    expect(errors[0]?.message).toBe('Query alias limit exceeded');
  });

  it('rejects excessive nesting depth', () => {
    const query = `query { ${'nested { '.repeat(13)}value ${'}'.repeat(13)} }`;
    const errors = validate(schema, parse(query), [queryProtectionRule]);
    expect(errors[0]?.message).toBe('Query depth limit exceeded');
  });
});
