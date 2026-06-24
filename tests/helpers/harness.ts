import http, { type Server } from 'http';
import type { Express } from 'express';
import request from 'supertest';
import type { LabelSuggester } from '../../src/ai/types';
import { createApp } from '../../src/app';
import { parseEnv, type Env } from '../../src/config/env';
import { buildContainer, type Container } from '../../src/container';
import { createLogger } from '../../src/lib/logger';
import { createMemoryRepositories } from '../../src/repositories/memory';
import { AnnotationService } from '../../src/services/AnnotationService';

export interface Harness {
  app: Express;
  /** A listening server, one per harness, reused by every request. */
  server: Server;
  container: Container;
  env: Env;
}

/**
 * Every server this file has opened.
 *
 * supertest will happily start a throwaway listener per request, but that
 * churns hundreds of ephemeral ports in one run, and a port recycled while
 * another worker is still dialling it sends the request to somebody else's
 * app — which answers a perfectly legitimate 404 because its maps are empty.
 * One stable listener per harness, closed after each test by `tests/setup.ts`,
 * removes that whole class of flake.
 */
const openServers = new Set<Server>();

/** Bind an app to a loopback port and register it for teardown. */
export function serve(app: Express): Server {
  const server = http.createServer(app);
  // `listen` binds synchronously, so `address()` is populated by the time
  // supertest asks for it and it never substitutes a listener of its own.
  server.listen(0);
  server.unref();
  openServers.add(server);
  return server;
}

/** Close every server opened since the last call. Used by the global afterEach. */
export async function closeOpenServers(): Promise<void> {
  const servers = [...openServers];
  openServers.clear();
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
}

export interface HarnessOptions {
  authRequired?: boolean;
  jwtSecret?: string;
  labelSuggester?: LabelSuggester;
}

export const TEST_JWT_SECRET = 'test-secret-value-long-enough';

/**
 * Build the real Express app over in-memory repositories. No database, no
 * container, no network — the only thing swapped out is the persistence
 * adapter, so middleware, validation, routing and error handling are all
 * production code paths.
 */
export function createHarness(options: HarnessOptions = {}): Harness {
  const env = parseEnv({
    NODE_ENV: 'test',
    PERSISTENCE: 'memory',
    LOG_LEVEL: 'silent',
    JWT_SECRET: options.jwtSecret ?? TEST_JWT_SECRET,
    AUTH_REQUIRED: options.authRequired ? 'true' : 'false',
  } as NodeJS.ProcessEnv);

  const container = buildContainer(env, {
    logger: createLogger('silent'),
    repositories: createMemoryRepositories(),
  });

  if (options.labelSuggester) {
    // Rebuild only the annotation service so a test can drive a stub provider.
    container.services.annotations = new AnnotationService({
      annotations: container.repositories.annotations,
      images: container.repositories.images,
      projects: container.repositories.projects,
      unitOfWork: container.repositories.unitOfWork,
      labelSuggester: options.labelSuggester,
    });
  }

  const app = createApp(container);
  return { app, server: serve(app), container, env };
}

export const api = (harness: Harness) => request(harness.server);

/** A well-formed 24-hex id that no record in a fresh harness will ever own. */
export const ABSENT_ID = '0123456789abcdef01234567';

/** An axis-aligned square polygon of the given side, anchored at (x, y). */
export function square(side: number, x = 0, y = 0) {
  return {
    type: 'polygon' as const,
    polygons: [
      {
        rings: [
          [
            [x, y],
            [x + side, y],
            [x + side, y + side],
            [x, y + side],
          ],
        ],
      },
    ],
  };
}

/** Create a project and one image, returning both ids. */
export async function seedProjectWithImage(
  harness: Harness,
  image: { width: number; height: number } = { width: 640, height: 480 },
): Promise<{ projectId: string; imageId: string }> {
  const projectResponse = await api(harness)
    .post('/api/projects')
    .send({ name: 'Seed project' })
    .expect(201);

  const projectId = projectResponse.body.id as string;

  const imagesResponse = await api(harness)
    .post(`/api/projects/${projectId}/images`)
    .send({
      images: [{ uri: 'https://example.com/seed.jpg', width: image.width, height: image.height }],
    })
    .expect(201);

  return { projectId, imageId: imagesResponse.body.images[0].id as string };
}
