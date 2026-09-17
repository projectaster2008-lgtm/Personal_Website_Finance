import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/** Generous default for normal API traffic. */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Slow down a moment and try again' } },
});

/** Tight limit on credential endpoints, keyed by IP + email to blunt spraying. */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String((req.body as { email?: string })?.email ?? '')}`,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' } },
});
