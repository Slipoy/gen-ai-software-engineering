import type { RequestHandler } from 'express';

export interface RateLimiterOptions {
  /** Maximum requests allowed per client within one window. */
  limit: number;
  windowMs: number;
  now?: () => number;
}

interface Window {
  startedAt: number;
  count: number;
}

/**
 * Fixed-window, in-memory rate limiter keyed by client IP.
 * Good enough for a single process; a multi-instance deployment would need a shared store (e.g. Redis).
 */
export function rateLimiter({ limit, windowMs, now = Date.now }: RateLimiterOptions): RequestHandler {
  const windows = new Map<string, Window>();

  return (req, res, next) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const time = now();

    let window = windows.get(key);
    if (!window || time - window.startedAt >= windowMs) {
      window = { startedAt: time, count: 0 };
      windows.set(key, window);
      // Drop stale entries so the map does not grow without bound.
      for (const [otherKey, other] of windows) {
        if (time - other.startedAt >= windowMs) windows.delete(otherKey);
      }
    }

    window.count += 1;
    const resetInSeconds = Math.ceil((window.startedAt + windowMs - time) / 1000);

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - window.count)));
    res.setHeader('X-RateLimit-Reset', String(resetInSeconds));

    if (window.count > limit) {
      res.setHeader('Retry-After', String(resetInSeconds));
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit of ${limit} requests per ${windowMs / 1000}s exceeded. Retry in ${resetInSeconds}s.`,
      });
    }

    next();
  };
}
