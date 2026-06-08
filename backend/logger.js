import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

// Pretty, human-readable logs in dev; structured JSON in production.
const logger = pino(
  isProduction
    ? { level: process.env.LOG_LEVEL || 'info' }
    : {
        level: process.env.LOG_LEVEL || 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
);

export default logger;
