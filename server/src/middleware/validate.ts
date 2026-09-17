import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validates and REPLACES the request part with the parsed value, so handlers
 * receive coerced, defaulted, typed data — never raw strings off the wire.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'query') {
        Object.defineProperty(req, 'validatedQuery', { value: parsed, writable: true });
      } else {
        req[source] = parsed;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new AppError(422, 'VALIDATION_ERROR', 'Some fields need attention', {
            fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          }),
        );
        return;
      }
      next(error);
    }
  };
}

/** Reads what `validate(schema, 'query')` stored. */
export function validatedQuery<T>(req: Request): T {
  return (req as unknown as { validatedQuery: T }).validatedQuery;
}
