/**
 * Minimal structured logger: one JSON object per line on stdout, which log tools (Docker, CloudWatch,
 * Datadog) can parse and search by field. Silent during tests (NODE_ENV=test) to keep output readable,
 * unless LOG_LEVEL is set explicitly.
 */
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
}

export function createLogger(env: NodeJS.ProcessEnv = process.env, write: (line: string) => void = console.log): Logger {
  const enabled = env.LOG_LEVEL ? env.LOG_LEVEL !== 'silent' : env.NODE_ENV !== 'test';
  return {
    info(event, fields = {}) {
      if (!enabled) return;
      write(JSON.stringify({ time: new Date().toISOString(), level: 'info', event, ...fields }));
    },
  };
}

export const logger = createLogger();
