import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Timing-safe authentication middleware.
 * Verifies Bearer token against server API_TOKEN using crypto.timingSafeEqual.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or malformed Authorization header or token query parameter'
    });
    return;
  }
  const serverToken = config.API_TOKEN;

  // Protect against timing attacks by padding buffers to equal length if needed
  const tokenBuf = Buffer.from(token);
  const serverTokenBuf = Buffer.from(serverToken);

  let match = false;
  if (tokenBuf.length === serverTokenBuf.length) {
    match = crypto.timingSafeEqual(tokenBuf, serverTokenBuf);
  } else {
    // Perform dummy timing-safe comparison to prevent length timing leaks
    crypto.timingSafeEqual(serverTokenBuf, serverTokenBuf);
    match = false;
  }

  if (!match) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Invalid API token'
    });
    return;
  }

  next();
}
