import { IExtractor, ExtractorMetadata, DownloadSectionOptions } from './types';
import { safeExec } from '../pipeline/exec';
import { config } from '../config';
import { classifyExtractorError } from './errorClassifier';
import { logger } from '../utils/logger';

export class YtDlpExtractor implements IExtractor {
  private command = config.YTDLP_RESOLVED.command;
  private argsPrefix = config.YTDLP_RESOLVED.argsPrefix;

  public async getMetadata(videoId: string): Promise<ExtractorMetadata> {
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      ...this.argsPrefix,
      '--ffmpeg-location', config.FFMPEG_RESOLVED_PATH,
      '--js-runtimes', 'node',
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--',
      canonicalUrl,
    ];

    try {
      const { stdout } = await safeExec(this.command, args, { timeoutMs: 30000 });
      const info = JSON.parse(stdout);
      return {
        videoId: info.id || videoId,
        title: info.title || 'clip',
        duration: info.duration || 0,
        availableResolutions: [360, 480, 720, 1080],
      };
    } catch (err: any) {
      logger.error({ videoId, err: err.message }, 'Failed to fetch metadata with yt-dlp');
      throw classifyExtractorError(err.stderr || err.message);
    }
  }

  public async downloadSection(options: DownloadSectionOptions): Promise<{ actualStartPts: number }> {
    const { videoId, startSeconds, endSeconds, maxHeight, outputFilePath, abortSignal } = options;

    // Apply 3-second lead-in pad and 1-second trailing pad for keyframe snapping
    const padStart = Math.max(0, startSeconds - 3);
    const padEnd = endSeconds + 1;
    const sectionSpec = `*${padStart}-${padEnd}`;

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const formatSpec = `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]/b`;

    const args = [
      ...this.argsPrefix,
      '--ffmpeg-location', config.FFMPEG_RESOLVED_PATH,
      '--js-runtimes', 'node',
      '--download-sections', sectionSpec,
      '-f', formatSpec,
      '--merge-output-format', 'mp4',
      '--force-keyframes-at-cuts',
      '--no-playlist',
      '--no-warnings',
      '-o', outputFilePath,
      '--',
      canonicalUrl,
    ];

    logger.info({ videoId, sectionSpec, maxHeight, outputFilePath }, 'Executing yt-dlp padded download');

    try {
      await safeExec(this.command, args, {
        timeoutMs: 120000,
        abortSignal,
      });
      return { actualStartPts: padStart };
    } catch (err: any) {
      logger.error({ videoId, err: err.message }, 'yt-dlp download failed');
      throw classifyExtractorError(err.stderr || err.message);
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const args = [...this.argsPrefix, '--version'];
      const { stdout } = await safeExec(this.command, args, { timeoutMs: 10000 });
      logger.info({ version: stdout.trim() }, 'yt-dlp health check passed');
      return true;
    } catch (err: any) {
      logger.error({ err: err.message }, 'yt-dlp health check failed');
      return false;
    }
  }
}

export const extractor: IExtractor = new YtDlpExtractor();
