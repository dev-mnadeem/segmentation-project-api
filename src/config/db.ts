import mongoose from 'mongoose';
import type { Logger } from '../lib/logger';

export interface ConnectOptions {
  uri: string;
  logger: Logger;
}

/**
 * Connect to MongoDB and build the declared indexes.
 *
 * `autoIndex` is left on: these collections are small enough that index builds
 * are cheap, and a portfolio reviewer running `docker compose up` should get
 * the indexes the README claims exist without a separate migration step. For a
 * large production dataset you would build them out of band instead.
 */
export async function connectDb({ uri, logger }: ConnectOptions): Promise<typeof mongoose> {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: true,
  });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
