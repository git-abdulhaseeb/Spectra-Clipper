import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: { windowMs: number; max: number; message?: string }) {
  const store = new Map<string, RateLimitRecord>();
  const { windowMs, max, message } = options;

  // Janitor to clean expired records every 60s
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 60000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let record = store.get(clientKey);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      store.set(clientKey, record);
      next();
      return;
    }

    record.count++;
    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        success: false,
        error: message || `Too many requests, please retry after ${retryAfter} seconds.`
      });
      return;
    }

    next();
  };
}
