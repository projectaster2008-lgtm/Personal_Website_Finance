/**
 * Express application.
 *
 * Kept separate from `index.ts` so tests can mount the app without binding a port.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { router } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';

export function createApp() {
  const app = express();

  // Behind a proxy (Railway, Fly, Render) so rate limiting sees the real IP.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  // 2 MB covers a large CSV paste; anything bigger belongs in file upload.
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api', apiLimiter, router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
