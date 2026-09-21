import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const errorDetails = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    res.status(400).json({
      success: false,
      error: `Validation error: ${errorDetails}`
    });
    return;
  }

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({
    err,
    url: req.originalUrl,
    method: req.method,
    statusCode
  }, 'Request error encountered');

  res.status(statusCode).json({
    success: false,
    error: message
  });
}
