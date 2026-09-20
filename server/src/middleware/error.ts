import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { PostingError } from '../domain/engine/postings.js';
import { isProduction } from '../config/env.js';

/** Terminal error handler. Nothing below this leaks a stack trace to a client. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof PostingError) {
    res.status(422).json({
      error: { code: 'POSTING_ERROR', message: error.message, details: { field: error.field } },
    });
    return;
  }

  // Duck-typed rather than `instanceof Prisma.PrismaClientKnownRequestError`.
  // Importing the Prisma namespace here would crash the process whenever the
  // client has not been generated, and the codes below are stable API.
  const prismaError = asPrismaError(error);
  if (prismaError) {
    if (prismaError.code === 'P2002') {
      res.status(409).json({
        error: { code: 'DUPLICATE', message: 'That already exists', details: prismaError.meta },
      });
      return;
    }
    if (prismaError.code === 'P2003' || prismaError.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Referenced record not found' } });
      return;
    }
    if (prismaError.code === 'P2014') {
      res.status(409).json({
        error: {
          code: 'IN_USE',
          message: 'This is still referenced by transactions and cannot be removed',
        },
      });
      return;
    }
  }

  if (error instanceof Error && error.name === 'JsonWebTokenError') {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    return;
  }
  if (error instanceof Error && error.name === 'TokenExpiredError') {
    res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Session expired' } });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Something went wrong on our side',
      details: isProduction ? undefined : { raw: String(error) },
    },
  });
}

/** Recognises a Prisma known-request error by shape, not by class identity. */
function asPrismaError(error: unknown): { code: string; meta?: unknown } | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { code?: unknown; clientVersion?: unknown; meta?: unknown };
  if (typeof candidate.code !== 'string' || !/^P\d{4}$/.test(candidate.code)) return null;
  return { code: candidate.code, meta: candidate.meta };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } });
}
