import fs from 'fs';
import path from 'path';
import checkDiskSpace from 'check-disk-space';
import { config } from '../config';
import { logger } from '../utils/logger';

export class Janitor {
  public static async assertSufficientDiskSpace(): Promise<void> {
    try {
      const disk = await checkDiskSpace(config.SCRATCH_DIR);
      const freeMb = Math.floor(disk.free / (1024 * 1024));

      if (freeMb < config.MIN_FREE_DISK_MB) {
        throw new Error(
          `Insufficient disk space on host: ${freeMb}MB free, but minimum required is ${config.MIN_FREE_DISK_MB}MB.`
        );
      }
    } catch (err: any) {
      if (err.message.includes('Insufficient disk space')) {
        throw err;
      }
      logger.warn({ err: err.message }, 'Failed to check disk space with check-disk-space');
    }
  }

  public static scrubScratchDirectoryOnBoot(): void {
    try {
      if (!fs.existsSync(config.SCRATCH_DIR)) {
        fs.mkdirSync(config.SCRATCH_DIR, { recursive: true });
        return;
      }

      const entries = fs.readdirSync(config.SCRATCH_DIR);
      let removedCount = 0;

      for (const entry of entries) {
        const fullPath = path.join(config.SCRATCH_DIR, entry);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          removedCount++;
        } catch (_) {}
      }

      logger.info({ removedCount }, 'Scratch directory boot scrub complete');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error scrubbing scratch directory');
    }
  }

  public static removeDirectory(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch (err: any) {
      logger.warn({ dirPath, err: err.message }, 'Failed to remove job directory');
    }
  }

  public static startPeriodicPurge(): void {
    setInterval(() => {
      try {
        const now = Date.now();
        const cutoff = now - 30 * 60 * 1000; // 30 minutes
        const entries = fs.readdirSync(config.SCRATCH_DIR);

        for (const entry of entries) {
          const fullPath = path.join(config.SCRATCH_DIR, entry);
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs < cutoff) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            logger.info({ purgedDir: entry }, 'Purged expired job directory');
          }
        }
      } catch (_) {}
    }, 5 * 60 * 1000).unref();
  }
}
