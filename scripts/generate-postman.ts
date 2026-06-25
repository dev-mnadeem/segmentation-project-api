import { writeFileSync } from 'fs';
import { join } from 'path';
import { createApp } from '../src/app';
import { parseEnv } from '../src/config/env';
import { buildContainer } from '../src/container';
import { createLogger } from '../src/lib/logger';
import { listRoutes } from './listRoutes';

/**
 * Regenerate `.postman/PearlAI.API.postman_collection.json` from the live
 * Express router.
 *
 * Run it with `npm run postman:generate`. It fails loudly if a route exists
 * with no request defined for it, which is the failure mode a hand-written
 * collection has: it drifts and nobody notices until a reviewer tries it.
 */

interface Request {
  name: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  auth?: boolean;
  description: string;
  /** Postman test script lines, used to chain ids between requests. */
  capture?: { variable: string; jsonPath: string };
  expectStatus: number;
}

/** A 200x150 rectangle that sits inside the 1280x720 images created below. */
const SQUARE = {
  type: 'polygon',
  polygons: [
    {
      rings: [
        [
          [100, 100],
          [300, 100],
          [300, 250],
          [100, 250],
        ],
      ],
    },
  ],
};

const requests: Array<{ folder: string; items: Request[] }> = [
  {
    folder: 'Health',
    items: [
      {
        name: 'GET /health',
        method: 'GET',
        path: '/health',
        description: 'Service summary plus the state of every dependency.',
        expectStatus: 200,
      },
      {
        name: 'GET /health/live',
        method: 'GET',
        path: '/health/live',
        description: 'Liveness probe. 200 whenever the process is running.',
        expectStatus: 200,
      },
      {
        name: 'GET /health/ready',
        method: 'GET',
        path: '/health/ready',
        description: 'Readiness probe. 503 when a dependency is down.',
        expectStatus: 200,
      },
    ],
  },
  {
    folder: 'Auth',
    items: [
      {
        name: 'POST /auth/signup',
        method: 'POST',
        path: '/auth/signup',
        body: { name: 'Ada Lovelace', email: '{{email}}', password: '{{password}}' },
        description: 'Create an account. Sets {{token}} and {{userId}}.',
        capture: { variable: 'token', jsonPath: 'token' },
        expectStatus: 201,
      },
      {
        name: 'POST /auth/login',
        method: 'POST',
        path: '/auth/login',
        body: { email: '{{email}}', password: '{{password}}' },
        description: 'Exchange credentials for a token. Sets {{token}}.',
        capture: { variable: 'token', jsonPath: 'token' },
        expectStatus: 200,
      },
      {
        name: 'NEG POST /auth/login (wrong password)',
        method: 'POST',
        path: '/auth/login',
        body: { email: '{{email}}', password: 'definitely-not-the-password' },
        description: 'Expect 401 with the generic "Invalid credentials" message.',
        expectStatus: 401,
      },
      {
        name: 'NEG POST /auth/signup (short password)',
        method: 'POST',
        path: '/auth/signup',
        body: { name: 'Too Short', email: 'short@example.com', password: 'abc' },
        description: 'Expect 400 listing the offending field.',
        expectStatus: 400,
      },
    ],
  },
  {
    folder: 'Projects',
    items: [
      {
        name: 'POST /projects',
        method: 'POST',
        path: '/projects',
        auth: true,
        body: { name: 'Street scenes', description: 'Dashcam frames' },
        description: 'Create a project. Sets {{projectId}}.',
        capture: { variable: 'projectId', jsonPath: 'id' },
        expectStatus: 201,
      },
      {
        name: 'GET /projects',
        method: 'GET',
        path: '/projects',
        query: { page: '1', limit: '20' },
        description: 'Paged project list, newest first. Optional ?status=.',
        expectStatus: 200,
      },
      {
        name: 'GET /projects/:id',
        method: 'GET',
        path: '/projects/{{projectId}}',
        description: 'Fetch one project.',
        expectStatus: 200,
      },
      {
        name: 'GET /projects/:id/stats',
        method: 'GET',
        path: '/projects/{{projectId}}/stats',
        description: 'Image and annotation counts plus a per-annotator breakdown.',
        expectStatus: 200,
      },
      {
        name: 'POST /projects/:projectId/images',
        method: 'POST',
        path: '/projects/{{projectId}}/images',
        auth: true,
        body: {
          images: [
            { uri: 'https://example.com/frame-001.jpg', width: 1280, height: 720 },
            { uri: 'https://example.com/frame-002.jpg', width: 1280, height: 720 },
          ],
        },
        description: 'Bulk-add images in one unit of work. Sets {{imageId}}.',
        capture: { variable: 'imageId', jsonPath: 'images.0.id' },
        expectStatus: 201,
      },
      {
        name: 'GET /projects/:projectId/images',
        method: 'GET',
        path: '/projects/{{projectId}}/images',
        query: { page: '1', limit: '20' },
        description: 'Paged image list for a project. Optional ?status=.',
        expectStatus: 200,
      },
      {
        name: 'GET /projects/:id/annotations/export',
        method: 'GET',
        path: '/projects/{{projectId}}/annotations/export',
        description: 'Flat export with a bounding box per mask.',
        expectStatus: 200,
      },
      {
        name: 'NEG GET /projects/:id (malformed id)',
        method: 'GET',
        path: '/projects/notanid',
        description: 'Expect 400 from param validation, not a 500 from the driver.',
        expectStatus: 400,
      },
      {
        name: 'NEG GET /projects (page=abc)',
        method: 'GET',
        path: '/projects',
        query: { page: 'abc' },
        description: 'Expect 400 rather than a NaN skip reaching the database.',
        expectStatus: 400,
      },
    ],
  },
  {
    folder: 'Images',
    items: [
      {
        name: 'GET /images/:id',
        method: 'GET',
        path: '/images/{{imageId}}',
        description: 'Fetch one image.',
        expectStatus: 200,
      },
      {
        name: 'NEG GET /images/:id (malformed id)',
        method: 'GET',
        path: '/images/notanid',
        description: 'Expect 400.',
        expectStatus: 400,
      },
    ],
  },
  {
    folder: 'Annotations',
    items: [
      {
        name: 'POST /annotations (polygon)',
        method: 'POST',
        path: '/annotations',
        auth: true,
        body: { image: '{{imageId}}', label: 'car', segmentation: SQUARE },
        description: 'Create a polygon annotation. Sets {{annotationId}}.',
        capture: { variable: 'annotationId', jsonPath: 'id' },
        expectStatus: 201,
      },
      {
        name: 'POST /annotations (RLE)',
        method: 'POST',
        path: '/annotations',
        auth: true,
        body: {
          image: '{{imageId}}',
          label: 'road',
          segmentation: { type: 'rle', size: [720, 1280], counts: [460800, 460800] },
        },
        description: 'Create an RLE annotation. counts must sum to height * width exactly.',
        expectStatus: 201,
      },
      {
        name: 'POST /annotations/suggest-label',
        method: 'POST',
        path: '/annotations/suggest-label',
        auth: true,
        body: { image: '{{imageId}}', segmentation: SQUARE },
        description: 'Rank labels for an unsaved mask. Echoes which provider answered.',
        expectStatus: 200,
      },
      {
        name: 'GET /annotations',
        method: 'GET',
        path: '/annotations',
        query: { label: 'car', page: '1', limit: '20' },
        description: 'Filter by label, imageId, projectId, createdBy (alias annotator).',
        expectStatus: 200,
      },
      {
        name: 'GET /annotations/:id',
        method: 'GET',
        path: '/annotations/{{annotationId}}',
        description: 'Fetch one annotation.',
        expectStatus: 200,
      },
      {
        name: 'GET /annotations/:id/rank',
        method: 'GET',
        path: '/annotations/{{annotationId}}/rank',
        description: 'Rank by area among annotations on the same image.',
        expectStatus: 200,
      },
      {
        name: 'NEG POST /annotations (RLE size mismatch)',
        method: 'POST',
        path: '/annotations',
        auth: true,
        body: {
          image: '{{imageId}}',
          label: 'road',
          segmentation: { type: 'rle', size: [4, 4], counts: [4, 12] },
        },
        description: 'Expect 400: the mask size must equal the image dimensions.',
        expectStatus: 400,
      },
      {
        name: 'NEG POST /annotations (area mismatch)',
        method: 'POST',
        path: '/annotations',
        auth: true,
        body: { image: '{{imageId}}', label: 'car', segmentation: SQUARE, area: 1 },
        description: 'Expect 400: a client-supplied area must match the server-computed one.',
        expectStatus: 400,
      },
      {
        name: 'NEG POST /annotations (missing label)',
        method: 'POST',
        path: '/annotations',
        auth: true,
        body: { image: '{{imageId}}', segmentation: SQUARE },
        description: 'Expect 400 naming the missing field.',
        expectStatus: 400,
      },
    ],
  },
];

function coveredRoutes(): Set<string> {
  const covered = new Set<string>();
  for (const { items } of requests) {
    for (const item of items) {
      covered.add(`${item.method} /api${toTemplate(item.path)}`);
    }
  }
  return covered;
}

/** Turn a concrete request path back into the Express template it matches. */
function toTemplate(path: string): string {
  return path
    .replace(/\{\{projectId\}\}/g, ':id')
    .replace(/\{\{imageId\}\}/g, ':id')
    .replace(/\{\{annotationId\}\}/g, ':id')
    .replace(/\/notanid/g, '/:id')
    .replace(/^\/projects\/:id\/images/, '/projects/:projectId/images');
}

function buildCollection() {
  return {
    info: {
      name: 'PearlAI API',
      description:
        'Generated from the live Express router by `npm run postman:generate`. ' +
        'Run the folders top to bottom: Auth sets {{token}}, Projects sets ' +
        '{{projectId}} and {{imageId}}, Annotations sets {{annotationId}}.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: 'http://localhost:7151/api' },
      { key: 'email', value: 'ada@example.com' },
      { key: 'password', value: 'correct-horse-battery' },
      { key: 'token', value: '' },
      { key: 'projectId', value: '' },
      { key: 'imageId', value: '' },
      { key: 'annotationId', value: '' },
    ],
    item: requests.map(({ folder, items }) => ({
      name: folder,
      item: items.map(toPostmanItem),
    })),
  };
}

function toPostmanItem(request: Request) {
  const query = Object.entries(request.query ?? {}).map(([key, value]) => ({ key, value }));
  const queryString = query.length
    ? '?' + query.map(({ key, value }) => `${key}=${value}`).join('&')
    : '';

  return {
    name: request.name,
    request: {
      method: request.method,
      header: [
        ...(request.body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
        ...(request.auth ? [{ key: 'Authorization', value: 'Bearer {{token}}' }] : []),
      ],
      ...(request.body
        ? { body: { mode: 'raw', raw: JSON.stringify(request.body, null, 2) } }
        : {}),
      url: {
        raw: `{{baseUrl}}${request.path}${queryString}`,
        host: ['{{baseUrl}}'],
        path: request.path.replace(/^\//, '').split('/'),
        ...(query.length ? { query } : {}),
      },
      description: request.description,
    },
    event: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            `pm.test('status is ${request.expectStatus}', function () {`,
            `  pm.response.to.have.status(${request.expectStatus});`,
            '});',
            ...(request.capture
              ? [
                  'var body = pm.response.json();',
                  `var value = ${request.capture.jsonPath
                    .split('.')
                    .reduce(
                      (acc, key) => `${acc}${/^\d+$/.test(key) ? `[${key}]` : `.${key}`}`,
                      'body',
                    )};`,
                  `if (value) { pm.collectionVariables.set('${request.capture.variable}', value); }`,
                ]
              : []),
          ],
        },
      },
    ],
  };
}

function main(): void {
  const env = parseEnv({
    NODE_ENV: 'test',
    PERSISTENCE: 'memory',
    LOG_LEVEL: 'silent',
  } as NodeJS.ProcessEnv);
  const app = createApp(buildContainer(env, { logger: createLogger('silent') }));

  const live = listRoutes(app);
  const covered = coveredRoutes();
  const missing = live.filter((route) => !covered.has(`${route.method} ${route.path}`));

  if (missing.length > 0) {
    const list = missing.map((route) => `${route.method} ${route.path}`).join(', ');
    throw new Error(`Routes with no Postman request: ${list}`);
  }

  const target = join(__dirname, '..', '.postman', 'PearlAI.API.postman_collection.json');
  writeFileSync(target, JSON.stringify(buildCollection(), null, 2) + '\n');
  process.stdout.write(
    `Wrote ${target}\n${live.length} routes on the app, all covered by a request.\n`,
  );
}

main();
