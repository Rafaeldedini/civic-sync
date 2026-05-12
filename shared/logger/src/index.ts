import pino, { type Logger, type LoggerOptions } from 'pino';

// ─── Shared Logger Factory ────────────────────────────────────────────────────
//
// Creates a structured Pino logger for any CIVIC-SYNC microservice.
// In development mode, output is piped through pino-pretty for readability.
// In production, raw JSON is emitted for log aggregation systems.
//

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Creates a configured Pino logger instance.
 *
 * @param serviceName - Identifier for the microservice (e.g. 'ingestion', 'persistence')
 * @param overrides   - Optional Pino configuration overrides
 */
export function createLogger(
  serviceName: string,
  overrides?: Partial<LoggerOptions>,
): Logger {
  const options: LoggerOptions = {
    level: process.env.LOG_LEVEL ?? 'info',
    name: serviceName,
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
    ...overrides,
  };

  return pino(options);
}

export type { Logger };
