import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@app/storage';
import { hash, verify, argon2id } from 'argon2';
import { randomBytes } from 'node:crypto';
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';

import { APP_CONFIG, type AppConfig } from '../../common/config.js';
import { AppError, invariant } from '../../common/errors.js';
import { limits, text } from '../../common/validation.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import type { AuthenticatedUser } from './auth.types.js';

type AuthPayload = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  user: User;
};

function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  invariant(
    value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    'VALIDATION_ERROR',
    'Request validation failed',
    {
      email: 'A valid email is required',
    },
  );
  return value;
}

function validatePassword(password: string): void {
  const bytes = Buffer.byteLength(password, 'utf8');
  invariant(
    password.length >= 12 && bytes <= 1024,
    'VALIDATION_ERROR',
    'Request validation failed',
    {
      password: 'Password must be at least 12 characters and at most 1024 bytes',
    },
  );
}

function pem(value: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  if (value.includes('BEGIN')) return value.replaceAll('\\n', '\n');
  const lines = value.match(/.{1,64}/g)?.join('\n') ?? value;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

@Injectable()
export class AuthService {
  private privateKeyPromise?: ReturnType<typeof importPKCS8>;
  private publicKeyPromise?: ReturnType<typeof importSPKI>;

  public constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async register(
    emailInput: string,
    nameInput: string,
    password: string,
  ): Promise<AuthPayload> {
    const email = normalizeEmail(emailInput);
    const name = text(nameInput, 'name', limits.name);
    validatePassword(password);
    const passwordHash = await hash(password, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    try {
      const created = await this.prisma.client.$transaction(async (transaction) => {
        const user = await transaction.user.create({ data: { email, name, passwordHash } });
        return { user, ...(await this.createSession(transaction, user)) };
      });
      return this.issuePayload(created.user, created.refreshToken, created.refreshTokenExpiresAt);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists');
      }
      throw error;
    }
  }

  public async login(emailInput: string, password: string): Promise<AuthPayload> {
    const email = normalizeEmail(emailInput);
    validatePassword(password);
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    const valid = user ? await verify(user.passwordHash, password).catch(() => false) : false;
    if (!user || !valid) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
    const session = await this.prisma.client.$transaction((transaction) =>
      this.createSession(transaction, user),
    );
    return this.issuePayload(user, session.refreshToken, session.refreshTokenExpiresAt);
  }

  public async refresh(token: string): Promise<AuthPayload> {
    const parsed = this.parseRefreshToken(token);
    const result = await this.prisma.client.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM refresh_sessions WHERE id = ${parsed.id}::uuid FOR UPDATE
        `;
        if (rows.length !== 1)
          throw new AppError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
        const session = await transaction.refreshSession.findUnique({
          where: { id: parsed.id },
          include: { user: true },
        });
        if (
          !session ||
          !(await verify(session.refreshTokenHash, parsed.secret).catch(() => false))
        ) {
          throw new AppError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
        }
        if (session.revokedAt) {
          await transaction.refreshSession.updateMany({
            where: { userId: session.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { reused: true as const };
        }
        if (session.expiresAt <= new Date()) {
          await transaction.refreshSession.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
          });
          throw new AppError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
        }
        await transaction.refreshSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return {
          reused: false as const,
          user: session.user,
          ...(await this.createSession(transaction, session.user)),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.reused) {
      throw new AppError('REFRESH_TOKEN_REUSED', 'Refresh token reuse detected');
    }
    return this.issuePayload(result.user, result.refreshToken, result.refreshTokenExpiresAt);
  }

  public async logout(token: string): Promise<boolean> {
    let parsed: { id: string; secret: string };
    try {
      parsed = this.parseRefreshToken(token);
    } catch {
      return true;
    }
    const session = await this.prisma.client.refreshSession.findUnique({
      where: { id: parsed.id },
    });
    if (!session || !(await verify(session.refreshTokenHash, parsed.secret).catch(() => false)))
      return true;
    await this.prisma.client.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  public async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const verified = await jwtVerify(token, await this.publicKey(), { algorithms: ['EdDSA'] });
      const id = verified.payload.sub;
      invariant(id, 'UNAUTHENTICATED', 'Authentication required');
      const user = await this.prisma.client.user.findUnique({
        where: { id },
        select: { id: true, email: true, name: true },
      });
      if (!user) throw new AppError('UNAUTHENTICATED', 'Authentication required');
      return user;
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      throw new AppError('UNAUTHENTICATED', 'Authentication required');
    }
  }

  private async createSession(
    transaction: Prisma.TransactionClient,
    user: User,
  ): Promise<{ refreshToken: string; refreshTokenExpiresAt: Date }> {
    const secret = randomBytes(32).toString('base64url');
    const refreshTokenExpiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);
    const session = await transaction.refreshSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: await hash(secret, { type: argon2id }),
        expiresAt: refreshTokenExpiresAt,
      },
    });
    return { refreshToken: `${session.id}.${secret}`, refreshTokenExpiresAt };
  }

  private parseRefreshToken(token: string): { id: string; secret: string } {
    const [id, secret, extra] = token.split('.');
    if (!id || !secret || extra || !/^[0-9a-f-]{36}$/i.test(id) || secret.length < 40) {
      throw new AppError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
    }
    return { id, secret };
  }

  private async issuePayload(
    user: User,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<AuthPayload> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresSeconds = nowSeconds + this.config.accessTokenTtlSeconds;
    const accessToken = await new SignJWT({ email: user.email, name: user.name })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresSeconds)
      .sign(await this.privateKey());
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(expiresSeconds * 1000),
      refreshTokenExpiresAt,
      user,
    };
  }

  private privateKey(): ReturnType<typeof importPKCS8> {
    this.privateKeyPromise ??= importPKCS8(
      pem(this.config.accessTokenPrivateKey, 'PRIVATE KEY'),
      'EdDSA',
    );
    return this.privateKeyPromise;
  }

  private publicKey(): ReturnType<typeof importSPKI> {
    this.publicKeyPromise ??= importSPKI(
      pem(this.config.accessTokenPublicKey, 'PUBLIC KEY'),
      'EdDSA',
    );
    return this.publicKeyPromise;
  }
}
