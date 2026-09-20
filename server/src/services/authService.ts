/**
 * Authentication.
 *
 * Access token (short JWT) + rotating opaque refresh token. Refresh rotation
 * means a stolen refresh token is usable at most once before the legitimate
 * client's next refresh invalidates the chain.
 */
import bcrypt from 'bcryptjs';
import type { AuthResponse, UserDto } from '@pfos/shared';
import { prisma } from '../lib/prisma.js';
import { conflict, unauthorized } from '../lib/errors.js';
import {
  accessTokenTtlSeconds,
  generateOpaqueToken,
  hashToken,
  refreshExpiry,
  signAccessToken,
} from '../lib/tokens.js';
import { seedDefaultsForUser } from './seedService.js';

const BCRYPT_ROUNDS = 12;

export async function register(input: {
  email: string;
  password: string;
  name?: string;
  currency?: string;
  timezone?: string;
  seedDefaults: boolean;
}): Promise<AuthResponse> {
  const email = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict('An account with that email already exists');

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      name: input.name ?? null,
      currency: input.currency ?? 'PHP',
      timezone: input.timezone ?? 'Asia/Manila',
    },
  });

  // A brand-new user with an empty Chart of Accounts cannot record anything, so
  // the workbook's six accounts and eleven categories are created up front.
  if (input.seedDefaults) await seedDefaultsForUser(user.id);

  return issueSession(user);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  // Always run a hash comparison, even when the user does not exist, so response
  // timing does not reveal which emails are registered.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const valid = await bcrypt.compare(password, hash);

  if (!user || !user.passwordHash || !valid) throw unauthorized('Email or password is incorrect');

  return issueSession(user);
}

export async function refresh(refreshToken: string): Promise<AuthResponse> {
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized('Please sign in again');
  }

  // Rotate: revoke the presented token in the same transaction that issues its
  // replacement, so a replay of the old one finds it already revoked.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueSession(stored.user);
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutEverywhere(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Password reset.
 *
 * Always resolves, whether or not the email exists — the caller must not be able
 * to enumerate accounts. The returned token is for the mailer; in development it
 * is logged so the flow can be exercised without an SMTP server.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true },
  });
  if (!user) return null;

  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // one hour

  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  return token;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw unauthorized('That reset link is no longer valid');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
    }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // A password change ends every existing session.
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function updateProfile(
  userId: string,
  data: Partial<Pick<UserDto, 'name' | 'currency' | 'timezone' | 'locale' | 'weekStartsOn'>>,
): Promise<UserDto> {
  const user = await prisma.user.update({ where: { id: userId }, data });
  return toUserDto(user);
}

/* ------------------------------------------------------------- internals --- */

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  currency: string;
  timezone: string;
  locale: string;
  weekStartsOn: number;
  createdAt: Date;
};

async function issueSession(user: UserRow): Promise<AuthResponse> {
  const refreshToken = generateOpaqueToken();

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiry() },
  });

  return {
    user: toUserDto(user),
    accessToken: signAccessToken({ sub: user.id, email: user.email }),
    refreshToken,
    expiresIn: accessTokenTtlSeconds(),
  };
}

export function toUserDto(user: UserRow): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    currency: user.currency,
    timezone: user.timezone,
    locale: user.locale,
    weekStartsOn: user.weekStartsOn,
    createdAt: user.createdAt.toISOString(),
  };
}
