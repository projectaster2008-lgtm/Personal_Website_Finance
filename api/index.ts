import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server/src/app.js';

let cachedApp: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (!cachedApp) {
    cachedApp = createApp();
  }
  return cachedApp;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = getApp();

    // Recover path if rewritten by Vercel
    const matchedPath =
      (req.headers['x-matched-path'] as string) ||
      (req.headers['x-forwarded-url'] as string) ||
      (req.headers['x-invoke-path'] as string);

    const rawUrl = req.url || '/api';
    let resolvedUrl = rawUrl;

    // Check for query parameter rewrite (e.g. /api?__v_path=auth/demo-login&...)
    try {
      const urlObj = new URL(rawUrl, 'http://localhost');
      const vPath = urlObj.searchParams.get('__v_path') || urlObj.searchParams.get('path');
      if (vPath) {
        urlObj.searchParams.delete('__v_path');
        urlObj.searchParams.delete('path');
        const remainingQuery = urlObj.searchParams.toString();
        const cleanSubPath = vPath.replace(/^\/+/, '');
        resolvedUrl = `/api/${cleanSubPath}${remainingQuery ? `?${remainingQuery}` : ''}`;
      } else if (matchedPath && matchedPath.startsWith('/api')) {
        const currentQuery = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '';
        resolvedUrl = matchedPath.includes('?') ? matchedPath : `${matchedPath}${currentQuery}`;
      } else if (!rawUrl.startsWith('/api')) {
        resolvedUrl = `/api${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      }
    } catch {
      if (matchedPath && matchedPath.startsWith('/api')) {
        resolvedUrl = matchedPath;
      } else if (!rawUrl.startsWith('/api')) {
        resolvedUrl = `/api${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      }
    }

    req.url = resolvedUrl;

    return (app as any)(req, res, (err: any) => {
      if (err) {
        console.error('[Vercel Serverless Function Error]:', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: err?.message || 'Server error processing request',
              },
            }),
          );
        }
      }
    });
  } catch (fatalError: any) {
    console.error('[Vercel Serverless Function Fatal Error]:', fatalError);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: fatalError?.message || 'Server initialization failed',
          },
        }),
      );
    }
  }
}

