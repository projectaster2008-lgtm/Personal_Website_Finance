import type { NextFunction, Request, Response } from 'express';

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Reads a route parameter as a string.
 *
 * `@types/express` v5 widened `req.params` values to `string | string[]`, since
 * a repeated `:id` can in principle produce an array. Every call site would
 * otherwise need its own cast, so the narrowing lives here once.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** Reads a query parameter as a single string, or undefined. */
export function queryParam(req: Request, name: string): string | undefined {
  const value = req.query[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}
