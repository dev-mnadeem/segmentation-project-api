import mongoose from 'mongoose';
import { createLabelSuggester } from './ai';
import type { Env } from './config/env';
import type { RepositorySet } from './domain/ports';
import { createLogger, type Logger } from './lib/logger';
import { createMemoryRepositories } from './repositories/memory';
import { createMongoRepositories } from './repositories/mongo';
import type { DependencyStatus, HealthProbe } from './routes/health';
import { AnnotationService } from './services/AnnotationService';
import { AuthService } from './services/AuthService';
import { ImageService } from './services/ImageService';
import { ProjectService } from './services/ProjectService';

export interface AppServices {
  auth: AuthService;
  projects: ProjectService;
  images: ImageService;
  annotations: AnnotationService;
}

export interface Container {
  env: Env;
  logger: Logger;
  repositories: RepositorySet;
  services: AppServices;
  probe: HealthProbe;
}

/**
 * The composition root: the one place that knows which adapter backs which
 * port. Everything downstream receives its collaborators as constructor
 * arguments, which is what lets the HTTP tests swap Mongo for in-memory maps
 * without touching a line of application code.
 */
export function buildContainer(env: Env, overrides: Partial<Container> = {}): Container {
  const logger = overrides.logger ?? createLogger(env.LOG_LEVEL);
  const repositories =
    overrides.repositories ??
    (env.PERSISTENCE === 'memory' ? createMemoryRepositories() : createMongoRepositories());

  const labelSuggester = createLabelSuggester(env, logger);

  const services: AppServices = {
    auth: new AuthService({ users: repositories.users, jwtSecret: env.JWT_SECRET }),
    projects: new ProjectService({
      projects: repositories.projects,
      images: repositories.images,
      annotations: repositories.annotations,
      users: repositories.users,
    }),
    images: new ImageService({
      images: repositories.images,
      projects: repositories.projects,
      unitOfWork: repositories.unitOfWork,
    }),
    annotations: new AnnotationService({
      annotations: repositories.annotations,
      images: repositories.images,
      projects: repositories.projects,
      unitOfWork: repositories.unitOfWork,
      labelSuggester,
    }),
  };

  return {
    env,
    logger,
    repositories,
    services,
    probe: overrides.probe ?? defaultProbe(env),
  };
}

const MONGO_STATES: Record<number, DependencyStatus['state']> = {
  0: 'down',
  1: 'up',
  2: 'down',
  3: 'down',
};

const MONGO_STATE_NAMES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function defaultProbe(env: Env): HealthProbe {
  if (env.PERSISTENCE === 'memory') {
    return async () => [{ name: 'persistence', state: 'skipped', detail: 'in-memory' }];
  }
  return async () => {
    const readyState = mongoose.connection.readyState;
    return [
      {
        name: 'mongodb',
        state: MONGO_STATES[readyState] ?? 'down',
        detail: MONGO_STATE_NAMES[readyState] ?? 'unknown',
      },
    ];
  };
}
