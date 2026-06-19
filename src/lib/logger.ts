import pino, { type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

/**
 * Build the application logger. Taking the level as an argument (rather than
 * reading `process.env` at import time) keeps module load order irrelevant and
 * lets tests run silently.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'password', '*.password', 'passwordHash'],
      remove: true,
    },
  });
}
