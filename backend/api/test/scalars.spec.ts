import { Kind, type ValueNode } from 'graphql';
import { describe, expect, it } from 'vitest';

import { BigIntScalar, DateTimeScalar, UuidScalar } from '../src/schema/scalars.js';

const uuid = '018f3e7a-7b5c-7abc-8def-1234567890ab';

describe('GraphQL scalars', () => {
  it('accepts UUID strings and rejects invalid values and literals', () => {
    const scalar = new UuidScalar();
    expect(scalar.parseValue(uuid)).toBe(uuid);
    expect(scalar.serialize(uuid)).toBe(uuid);
    expect(scalar.parseLiteral({ kind: Kind.STRING, value: uuid })).toBe(uuid);
    expect(() => scalar.parseValue('not-a-uuid')).toThrow('Invalid UUID');
    expect(() => scalar.parseValue(42)).toThrow('Invalid UUID');
    expect(() => scalar.parseLiteral({ kind: Kind.INT, value: '1' })).toThrow(
      'UUID must be a string',
    );
  });

  it('round-trips valid DateTime values and rejects malformed inputs', () => {
    const scalar = new DateTimeScalar();
    const date = scalar.parseValue('2026-08-20T12:34:56.000Z');
    expect(date).toEqual(new Date('2026-08-20T12:34:56.000Z'));
    expect(scalar.serialize(date)).toBe('2026-08-20T12:34:56.000Z');
    expect(scalar.serialize('2026-08-20T12:34:56Z')).toBe('2026-08-20T12:34:56.000Z');
    expect(scalar.parseLiteral({ kind: Kind.STRING, value: '2026-08-20T00:00:00Z' })).toEqual(
      new Date('2026-08-20T00:00:00Z'),
    );
    expect(() => scalar.parseValue('not-a-date')).toThrow('Invalid DateTime');
    expect(() => scalar.parseValue(123)).toThrow('Invalid DateTime');
    expect(() => scalar.parseLiteral({ kind: Kind.INT, value: '1' })).toThrow(
      'DateTime must be a string',
    );
  });

  it('serializes arbitrary-size integers without precision loss', () => {
    const scalar = new BigIntScalar();
    expect(scalar.parseValue('900719925474099312345')).toBe(900719925474099312345n);
    expect(scalar.parseValue(-42)).toBe(-42n);
    expect(scalar.serialize(99n)).toBe('99');
    expect(scalar.parseLiteral({ kind: Kind.INT, value: '123' })).toBe(123n);
    expect(scalar.parseLiteral({ kind: Kind.STRING, value: '-7' })).toBe(-7n);
    expect(() => scalar.parseValue('1.5')).toThrow('Invalid BigInt');
    expect(() => scalar.parseValue({})).toThrow('Invalid BigInt');
    expect(() => scalar.parseLiteral({ kind: Kind.FLOAT, value: '1.5' } as ValueNode)).toThrow(
      'BigInt must be an integer',
    );
  });
});
