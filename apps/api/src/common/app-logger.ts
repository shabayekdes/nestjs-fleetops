import { ConsoleLogger, type LogLevel } from '@nestjs/common';

const ORDER: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];

/** The given level and every more severe one. */
export function logLevelsFrom(level: LogLevel): LogLevel[] {
  return ORDER.slice(ORDER.indexOf(level));
}

export function createAppLogger(
  nodeEnv: string,
  level: LogLevel,
): ConsoleLogger {
  return new ConsoleLogger({
    json: nodeEnv === 'production',
    logLevels: logLevelsFrom(level),
  });
}
