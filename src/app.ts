import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import pinoHttp from 'pino-http';
import { MAX_REQUEST_BODY } from './config/constants';
import type { Container } from './container';
import { attachUser } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

const HEALTH_PATHS = new Set(['/api/health', '/api/health/live', '/api/health/ready']);

/**
 * Build the Express app from a container.
 *
 * Taking the container as an argument (rather than importing a singleton) is
 * what makes the app testable: `tests/api` builds one backed by in-memory
 * repositories and drives the real middleware stack with supertest.
 */
export function createApp(container: Container): Express {
  const { env, logger } = container;
  const app = express();

  // Behind a proxy the rate limiter needs the real client IP, not the hop.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') }));
  app.use(compression());
  app.use(express.json({ limit: MAX_REQUEST_BODY }));
  app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_BODY }));

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
      // Health checks would otherwise dominate the log in any orchestrator.
      autoLogging: { ignore: (req) => HEALTH_PATHS.has(req.url ?? '') },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  const auth = { jwtSecret: env.JWT_SECRET, authRequired: env.AUTH_REQUIRED };
  app.use(attachUser(auth));

  app.use(
    '/api',
    apiRouter({
      services: container.services,
      auth,
      probe: container.probe,
      rateLimitEnabled: env.NODE_ENV !== 'test',
    }),
  );

  app.use(notFoundHandler());
  app.use(errorHandler(logger, env.NODE_ENV !== 'production'));

  return app;
}
