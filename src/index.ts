import express from 'express';
import cors from 'cors';
import { config } from './config';
import { logger } from './utils/logger';
import { authenticateToken } from './middleware/auth';
import { createRateLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import healthRoute from './routes/health';
import jobsRoute from './routes/jobs';
import downloadRoute from './routes/download';
import { jobQueue } from './queue/memoryQueue';
import { executeJob } from './pipeline/jobRunner';
import { Janitor } from './pipeline/janitor';
import { extractor } from './extractor/ytdlpExtractor';

export const app = express();

// Basic security and parsing middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '2mb' }));

// Global rate limiter
const globalLimiter = createRateLimiter({ windowMs: 60000, max: 120 });
app.use(globalLimiter);

// Health and observability route (unauthenticated for uptime monitors)
app.use('/health', healthRoute);

// Protected application routes
app.use('/v1/jobs', authenticateToken, jobsRoute);
app.use('/v1/jobs', authenticateToken, downloadRoute);

// Global error handler
app.use(errorHandler);

// Register pipeline transcode worker
jobQueue.registerProcessor(executeJob);

// Serverless / Standalone bootstrap
async function bootstrap() {
  if (process.env.VERCEL) {
    logger.info('Running in Vercel serverless environment');
    return;
  }

  // 1. Scrub scratch directory on startup
  Janitor.scrubScratchDirectoryOnBoot();

  // 2. Start background periodic cleanup
  Janitor.startPeriodicPurge();

  // 3. Pre-flight health check of extractor
  const extractorHealthy = await extractor.healthCheck();
  if (!extractorHealthy) {
    logger.warn('Warning: yt-dlp health check failed on boot. Ensure python/yt-dlp is installed and accessible.');
  }

  // 4. Start listening
  const server = app.listen(config.PORT, () => {
    logger.info({
      port: config.PORT,
      env: config.NODE_ENV,
      scratchDir: config.SCRATCH_DIR,
      maxConcurrent: config.MAX_CONCURRENT_JOBS,
    }, 'Clipper server is up and listening');
  });

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Gracefully stopping Clipper server...');
    server.close(() => {
      logger.info('HTTP server closed. Exiting process.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forcefully exiting after shutdown timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.fatal({ err }, 'Fatal error during server bootstrap');
    process.exit(1);
  });
}

export default app;
