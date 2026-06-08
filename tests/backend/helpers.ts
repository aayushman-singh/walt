import express from 'express';
import type { Express, Router } from 'express';

/**
 * Build a minimal Express app mounting a single router under test.
 * Never imports backend/server.js (which boots a real server + native db).
 */
export function makeApp(router: Router): Express {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}
