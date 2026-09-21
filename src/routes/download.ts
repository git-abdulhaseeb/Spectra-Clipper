import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { jobQueue } from '../queue/memoryQueue';
import { assertSafePath, sanitizeFilename } from '../utils/sanitize';
import { config } from '../config';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get('/:id/file', (req: Request, res: Response): void => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    res.status(400).json({ success: false, error: 'Invalid Job ID format (must be UUIDv4)' });
    return;
  }

  const job = jobQueue.getJob(id);
  if (!job || job.status !== 'completed' || !job.outputFilePath) {
    res.status(404).json({ success: false, error: 'File not found or job is not yet completed.' });
    return;
  }

  try {
    // Assert target path resides strictly inside scratch directory to prevent path traversal
    const safePath = assertSafePath(config.SCRATCH_DIR, job.outputFilePath);

    if (!fs.existsSync(safePath)) {
      res.status(404).json({ success: false, error: 'The requested clip file has already expired.' });
      return;
    }

    const safeFilename = sanitizeFilename(job.input.title || `clip_${job.input.videoId}`);

    res.download(safePath, safeFilename, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Error delivering video file' });
        }
      } else {
        // Schedule cleanup of job directory 15 minutes after successful download
        setTimeout(() => {
          try {
            const jobDir = path.dirname(safePath);
            if (fs.existsSync(jobDir)) {
              fs.rmSync(jobDir, { recursive: true, force: true });
            }
          } catch (_) {}
        }, 15 * 60 * 1000).unref();
      }
    });
  } catch (err: any) {
    res.status(403).json({ success: false, error: err.message });
  }
});

export default router;
