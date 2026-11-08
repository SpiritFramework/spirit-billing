import { PanelApiError } from '../services/panel.js';

/**
 * Client-safe error text. Logs full detail when an upstream/panel message is replaced.
 */
export function publicErrorMessage(
  err: unknown,
  fallback: string,
  log?: { warn: (obj: unknown, msg?: string) => void },
): string {
  if (err instanceof PanelApiError) {
    log?.warn({ err: err.message, status: err.status }, 'panel upstream error sanitized');
    return fallback;
  }

  const status = (err as { statusCode?: number })?.statusCode;
  const message = err instanceof Error ? err.message : '';
  if (typeof status === 'number' && status >= 400 && status < 500 && message) {
    // Trusted app-thrown 4xx (billing validation) — safe to surface.
    if (!/prisma|sql|stack|ENOENT|EACCES|panel api|upstream/i.test(message)) {
      return message.slice(0, 300);
    }
  }

  if (message) {
    log?.warn({ err: message }, 'error sanitized for client');
  }
  return fallback;
}
