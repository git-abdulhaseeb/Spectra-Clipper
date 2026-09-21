import { Router, Request, Response, NextFunction } from 'express';
import { CreateJobSchema } from '../validators/jobSchema';
import { jobQueue } from '../queue/memoryQueue';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();

// Limit job creation to 10 clips per minute per client (does not affect progress polling)
const jobCreateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 10,
  message: 'Too many clip requests created. Please wait a minute.'
});

// POST /v1/jobs - Enqueue a new clip job
router.post('/', jobCreateLimiter, (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = CreateJobSchema.parse(req.body);
    const job = jobQueue.enqueue(validated);

    res.status(202).json({
      success: true,
      jobId: job.id,
      status: job.status,
      message: 'Job enqueued successfully',
    });
  } catch (err) {
    next(err);
  }
});

// GET /v1/jobs/:id/progress - Status via JSON or SSE (Server-Sent Events)
router.get('/:id/progress', (req: Request, res: Response) => {
  const { id } = req.params;
  const job = jobQueue.getJob(id);

  if (!job) {
    res.status(404).json({
      success: false,
      error: `Job with ID [${id}] not found or has expired.`,
    });
    return;
  }

  const acceptsSse = req.headers.accept === 'text/event-stream';

  if (acceptsSse) {
    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (currentJob: any) => {
      res.write(`data: ${JSON.stringify(currentJob)}\n\n`);
    };

    // Send immediate initial state
    sendEvent(job);

    if (job.status === 'completed' || job.status === 'failed') {
      res.end();
      return;
    }

    const listener = (updatedJob: any) => {
      sendEvent(updatedJob);
      if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
        jobQueue.removeListener(`progress:${id}`, listener);
        res.end();
      }
    };

    jobQueue.on(`progress:${id}`, listener);

    req.on('close', () => {
      jobQueue.removeListener(`progress:${id}`, listener);
    });
  } else {
    // Return standard JSON response for short polling
    res.json({
      success: true,
      job: {
        id: job.id,
        videoId: job.input.videoId,
        title: job.input.title,
        status: job.status,
        step: job.step,
        progress: job.progress,
        error: job.error,
        completedAt: job.completedAt,
      },
    });
  }
});

export default router;
