import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';

export interface DependencyStatus {
  name: string;
  /** `up` when usable, `down` when not, `skipped` when not configured at all. */
  state: 'up' | 'down' | 'skipped';
  detail?: string;
}

/** Reports on whatever the app depends on. Supplied by the container. */
export type HealthProbe = () => Promise<DependencyStatus[]>;

/**
 * Three endpoints, because they answer different questions:
 *
 *   GET /health        human summary, always 200 if the process is alive
 *   GET /health/live   is the process running at all (for a restart policy)
 *   GET /health/ready  can it serve traffic — 503 when a dependency is down
 *
 * The previous single endpoint returned `status: "ok"` with a 200 even when
 * MongoDB was disconnected, which makes it useless as a load-balancer probe.
 */
export function healthRoutes(probe: HealthProbe): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const dependencies = await probe();
      res.json({
        service: 'PearlAI API',
        status: isReady(dependencies) ? 'ok' : 'degraded',
        uptimeSeconds: Math.round(process.uptime()),
        dependencies,
      });
    }),
  );

  router.get('/live', (_req, res) => {
    res.json({ status: 'alive' });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const dependencies = await probe();
      const ready = isReady(dependencies);
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', dependencies });
    }),
  );

  return router;
}

function isReady(dependencies: DependencyStatus[]): boolean {
  return dependencies.every((dependency) => dependency.state !== 'down');
}
