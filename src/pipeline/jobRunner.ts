import path from 'path';
import fs from 'fs';
import { JobRecord, jobQueue } from '../queue/memoryQueue';
import { extractor } from '../extractor/ytdlpExtractor';
import { convertJson3ToSrt } from './captions';
import { transcodeClip } from './transcode';
import { Janitor } from './janitor';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function executeJob(job: JobRecord): Promise<string> {
  const { id, input } = job;
  const jobDir = path.join(config.SCRATCH_DIR, id);

  // 1. Assert pre-flight disk space
  await Janitor.assertSufficientDiskSpace();

  // 2. Prepare isolated job directory
  fs.mkdirSync(jobDir, { recursive: true });

  const rawDownloadPath = path.join(jobDir, 'raw_segment.mp4');
  const srtPath = path.join(jobDir, 'captions.srt');
  const finalOutputPath = path.join(jobDir, 'output.mp4');

  try {
    // 3. Extract padded video section
    jobQueue.updateProgress(id, 'Fetching video stream from YouTube...', 25);
    const { actualStartPts } = await extractor.downloadSection({
      videoId: input.videoId,
      startSeconds: input.start,
      endSeconds: input.end,
      maxHeight: input.maxHeight,
      outputFilePath: rawDownloadPath,
    });

    // 4. Process Captions if requested
    let hasValidSrt = false;
    if (input.captionsMode !== 'none' && input.captionData) {
      jobQueue.updateProgress(id, 'Synchronizing subtitle timecodes...', 55);
      hasValidSrt = convertJson3ToSrt(
        input.captionData,
        input.start,
        input.end,
        srtPath
      );
    }

    // 5. Transcode with frame accuracy and PTS alignment
    jobQueue.updateProgress(id, 'Cutting and encoding clip with ffmpeg...', 75);
    await transcodeClip({
      inputVideoPath: rawDownloadPath,
      outputVideoPath: finalOutputPath,
      targetStartSec: input.start,
      targetEndSec: input.end,
      actualDownloadedStartPts: actualStartPts,
      captionsMode: hasValidSrt ? input.captionsMode : 'none',
      srtFilePath: hasValidSrt ? srtPath : undefined,
      jobDir,
    });

    // 6. Clean up raw segment file immediately to reclaim disk space
    try {
      if (fs.existsSync(rawDownloadPath)) {
        fs.unlinkSync(rawDownloadPath);
      }
    } catch (_) {}

    logger.info({ jobId: id, finalOutputPath }, 'Transcode pipeline completed');
    return finalOutputPath;
  } catch (err: any) {
    // On failure, clean up entire job directory to prevent disk leaks
    Janitor.removeDirectory(jobDir);
    throw err;
  }
}
