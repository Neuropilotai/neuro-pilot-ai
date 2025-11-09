/**
 * Structured logger using Pino
 */

import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level: LOG_LEVEL,
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname'
    }
  } : undefined
});

export default logger;
