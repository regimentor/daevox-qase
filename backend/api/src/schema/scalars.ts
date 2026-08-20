import { Scalar, type CustomScalar } from '@nestjs/graphql';
import { GraphQLError, Kind, type ValueNode } from 'graphql';

@Scalar('UUID', () => String)
export class UuidScalar implements CustomScalar<unknown, string> {
  public description = 'RFC 4122 UUID';
  public parseValue(value: unknown): string {
    return this.validate(value);
  }
  public serialize(value: unknown): string {
    return this.validate(value);
  }
  public parseLiteral(ast: ValueNode): string {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('UUID must be a string');
    return this.validate(ast.value);
  }
  private validate(value: unknown): string {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    )
      throw new GraphQLError('Invalid UUID');
    return value;
  }
}

@Scalar('DateTime', () => Date)
export class DateTimeScalar implements CustomScalar<string, Date> {
  public description = 'ISO 8601 UTC timestamp';
  public parseValue(value: unknown): Date {
    return this.parse(value);
  }
  public serialize(value: unknown): string {
    const date = value instanceof Date ? value : this.parse(value);
    return date.toISOString();
  }
  public parseLiteral(ast: ValueNode): Date {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('DateTime must be a string');
    return this.parse(ast.value);
  }
  private parse(value: unknown): Date {
    if (typeof value !== 'string' && !(value instanceof Date))
      throw new GraphQLError('Invalid DateTime');
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new GraphQLError('Invalid DateTime');
    return date;
  }
}

@Scalar('BigInt', () => String)
export class BigIntScalar implements CustomScalar<string, bigint> {
  public description = 'Decimal arbitrary-size integer';
  public parseValue(value: unknown): bigint {
    return this.parse(value);
  }
  public serialize(value: unknown): string {
    return this.parse(value).toString();
  }
  public parseLiteral(ast: ValueNode): bigint {
    if (ast.kind !== Kind.STRING && ast.kind !== Kind.INT)
      throw new GraphQLError('BigInt must be an integer');
    return this.parse(ast.value);
  }
  private parse(value: unknown): bigint {
    if (
      (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') ||
      !/^-?\d+$/.test(String(value))
    )
      throw new GraphQLError('Invalid BigInt');
    return BigInt(value);
  }
}
