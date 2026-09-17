import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { prisma } from '../lib/prisma.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        currency: string;
        timezone: string;
        locale: string;
        weekStartsOn: number;
      };
    }
  }
}

/**
 * Attaches the authenticated user to the request.
 *
 * The user row is loaded (not just trusted from the JWT) because currency and
 * timezone drive every period calculation, and a stale token must not pin them
 * to old values after the user changes settings.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    const payload = verifyAccessToken(header.slice(7));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, currency: true, timezone: true, locale: true, weekStartsOn: true },
    });
    if (!user) throw unauthorized('Your session is no longer valid');

    req.user = user;
    next();
  } catch (error) {
    next(error instanceof Error && error.name === 'AppError' ? error : unauthorized());
  }
}

/** Narrow helper so route handlers get a non-optional user without repeating the check. */
export function currentUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw unauthorized();
  return req.user;
}
