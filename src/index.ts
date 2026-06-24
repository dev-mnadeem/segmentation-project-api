import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { SHUTDOWN_GRACE_MS } from './config/constants';
import { parseEnv } from './config/env';
import { buildContainer } from './container';

async function main(): Promise<void> {
  const env = parseEnv();
  const container = buildContainer(env);
  const { logger } = container;

  if (env.PERSISTENCE === 'mongo') {
    // Connect before listening so the first request cannot arrive at a socket
    // with no database behind it. A failure here aborts startup rather than
    // leaving a process that answers 500 to everything.
    await connectDb({ uri: env.MONGODB_URI!, logger });
  } else {
    logger.warn('PERSISTENCE=memory: all data is in-process and lost on restart');
  }

  const server = http.createServer(createApp(container));

  await new Promise<void>((resolve) => server.listen(env.PORT, resolve));
  logger.info({ port: env.PORT, persistence: env.PERSISTENCE }, 'PearlAI API listening');

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn({ signal }, 'Shutting down');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();

    server.close(async () => {
      if (env.PERSISTENCE === 'mongo') await disconnectDb();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  // The logger may not exist yet (a bad env aborts before it is built), so this
  // one path writes straight to stderr.
  process.stderr.write(`Fatal startup error: ${(error as Error).message}\n`);
  process.exit(1);
});
