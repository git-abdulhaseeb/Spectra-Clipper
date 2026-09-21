import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { CreateJobInput } from '../validators/jobSchema';
import { logger } from '../utils/logger';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface JobRecord {
  id: string;
  input: CreateJobInput;
  status: JobStatus;
  step: string;
  progress: number;
  outputFilePath?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export class JobQueue extends EventEmitter {
  private jobs = new Map<string, JobRecord>();
  private waitingQueue: string[] = [];
  private activeCount = 0;
  private processor?: (job: JobRecord) => Promise<string>;

  constructor() {
    super();

    // Janitor: Purge old jobs from memory after 30 minutes
    setInterval(() => {
      const now = Date.now();
      const cutoff = now - 30 * 60 * 1000;
      for (const [id, job] of this.jobs.entries()) {
        if (job.updatedAt < cutoff && job.status !== 'processing') {
          this.jobs.delete(id);
        }
      }
    }, 60000).unref();
  }

  public registerProcessor(fn: (job: JobRecord) => Promise<string>): void {
    this.processor = fn;
  }

  public enqueue(input: CreateJobInput): JobRecord {
    if (this.waitingQueue.length >= config.MAX_QUEUE_DEPTH) {
      throw new Error(`Server is busy. Queue capacity limit reached (${config.MAX_QUEUE_DEPTH}). Please wait a moment and try again.`);
    }

    const id = uuidv4();
    const job: JobRecord = {
      id,
      input,
      status: 'queued',
      step: 'Waiting in queue...',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobs.set(id, job);
    this.waitingQueue.push(id);

    logger.info({ jobId: id, queueLength: this.waitingQueue.length }, 'Job added to queue');
    this.processNext();

    return job;
  }

  public getJob(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  public updateProgress(id: string, step: string, progress: number): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.step = step;
    job.progress = Math.min(100, Math.max(0, progress));
    job.updatedAt = Date.now();

    this.emit(`progress:${id}`, job);
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= config.MAX_CONCURRENT_JOBS) {
      return;
    }

    const nextId = this.waitingQueue.shift();
    if (!nextId) {
      return;
    }

    const job = this.jobs.get(nextId);
    if (!job || !this.processor) {
      return;
    }

    this.activeCount++;
    job.status = 'processing';
    job.step = 'Initializing transcode pipeline...';
    job.progress = 5;
    job.updatedAt = Date.now();
    this.emit(`progress:${nextId}`, job);

    logger.info({ jobId: nextId, activeCount: this.activeCount }, 'Beginning job execution');

    try {
      const outputPath = await this.processor(job);
      job.status = 'completed';
      job.step = 'Ready for download';
      job.progress = 100;
      job.outputFilePath = outputPath;
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
      this.emit(`progress:${nextId}`, job);
      logger.info({ jobId: nextId }, 'Job completed successfully');
    } catch (err: any) {
      job.status = 'failed';
      job.step = 'Failed';
      job.error = err.message || 'Processing failed';
      job.updatedAt = Date.now();
      this.emit(`progress:${nextId}`, job);
      logger.error({ jobId: nextId, err }, 'Job processing failed');
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
}

export const jobQueue = new JobQueue();
