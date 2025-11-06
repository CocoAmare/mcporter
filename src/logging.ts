const LOG_LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

type LogLevelKey = keyof typeof LOG_LEVEL_ORDER;

const LOG_LEVEL_ALIASES: Record<string, LogLevelKey> = {
  warning: 'warn',
  verbose: 'debug',
};

export type LogLevel = LogLevelKey;

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  debug?(message: string): void;
}

export function parseLogLevel(value: string | undefined, defaultLevel: LogLevel = 'warn'): LogLevel {
  if (!value) {
    return defaultLevel;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultLevel;
  }
  const alias = LOG_LEVEL_ALIASES[normalized];
  const candidate = alias ?? (normalized in LOG_LEVEL_ORDER ? (normalized as LogLevel) : undefined);
  if (!candidate) {
    const allowed = [...Object.keys(LOG_LEVEL_ORDER), ...Object.keys(LOG_LEVEL_ALIASES)]
      .filter((key, index, array) => array.indexOf(key) === index)
      .join(', ');
    throw new Error(`Invalid log level '${value}'. Expected one of: ${allowed}.`);
  }
  return candidate;
}

export function resolveLogLevelFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  defaultLevel: LogLevel = 'warn'
): LogLevel {
  try {
    return parseLogLevel(env.MCPORTER_LOG_LEVEL, defaultLevel);
  } catch (error) {
    const raw = env.MCPORTER_LOG_LEVEL;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[mcporter] Ignoring invalid MCPORTER_LOG_LEVEL value '${raw ?? ''}': ${message}`);
    return defaultLevel;
  }
}

function shouldLog(level: LogLevel, threshold: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[threshold];
}

export function createPrefixedConsoleLogger(prefix: string, level: LogLevel): Logger {
  const threshold = parseLogLevel(level);
  const format = (message: string) => `[${prefix}] ${message}`;
  return {
    debug(message) {
      if (shouldLog('debug', threshold)) {
        console.debug(format(message));
      }
    },
    info(message) {
      if (shouldLog('info', threshold)) {
        console.log(format(message));
      }
    },
    warn(message) {
      if (shouldLog('warn', threshold)) {
        console.warn(format(message));
      }
    },
    error(message, error) {
      if (shouldLog('error', threshold)) {
        console.error(format(message));
        if (error) {
          console.error(error);
        }
      }
    },
  };
}
