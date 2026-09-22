import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server/src/app.js';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  return (app as any)(req, res);
}
