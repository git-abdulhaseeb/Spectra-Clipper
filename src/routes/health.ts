import { Router, Request, Response } from 'express';
import checkDiskSpace from 'check-disk-space';
import { config } from '../config';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  let diskStatus: any = { status: 'unknown' };

  try {
    const disk = await checkDiskSpace(config.SCRATCH_DIR);
    const freeMb = Math.floor(disk.free / (1024 * 1024));
    diskStatus = {
      freeMb,
      sufficient: freeMb >= config.MIN_FREE_DISK_MB,
    };
  } catch (err: any) {
    diskStatus = { error: err.message };
  }

  const mem = process.memoryUsage();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    disk: diskStatus,
    memory: {
      rssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
    },
    concurrencyConfig: {
      maxConcurrent: config.MAX_CONCURRENT_JOBS,
      maxQueue: config.MAX_QUEUE_DEPTH,
    },
  });
});

export default router;
