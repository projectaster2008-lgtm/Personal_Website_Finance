/** Typed application errors. The error middleware maps these to status codes. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Sign in to continue') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this') =>
  new AppError(403, 'FORBIDDEN', message);

/**
 * Used for anything the current user does not own. We deliberately return 404
 * rather than 403 for another user's row, so the API never confirms that a
 * record exists in someone else's account.
 */
export const notFound = (what = 'Resource') =>
  new AppError(404, 'NOT_FOUND', `${what} not found`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'UNPROCESSABLE', message, details);
