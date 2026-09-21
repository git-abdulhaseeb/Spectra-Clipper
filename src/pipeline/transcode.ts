import path from 'path';
import fs from 'fs';
import { safeExec } from './exec';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface TranscodeOptions {
  inputVideoPath: string;
  outputVideoPath: string;
  targetStartSec: number;
  targetEndSec: number;
  actualDownloadedStartPts: number;
  captionsMode: 'none' | 'soft' | 'burned' | 'separate_srt';
  srtFilePath?: string;
  jobDir: string;
  abortSignal?: AbortSignal;
}

export async function transcodeClip(options: TranscodeOptions): Promise<string> {
  const {
    inputVideoPath,
    outputVideoPath,
    targetStartSec,
    targetEndSec,
    actualDownloadedStartPts,
    captionsMode,
    srtFilePath,
    jobDir,
    abortSignal,
  } = options;

  const ffmpegBin = config.FFMPEG_RESOLVED_PATH;
  const deltaOffset = Math.max(0, targetStartSec - actualDownloadedStartPts);
  const targetDuration = targetEndSec - targetStartSec;

  const baseArgs = [
    '-y',
    '-ss', deltaOffset.toFixed(3),
    '-i', inputVideoPath,
  ];

  let encodingArgs: string[] = [];

  if (captionsMode === 'soft' && srtFilePath && fs.existsSync(srtFilePath)) {
    // Mux as soft subtitle stream (mov_text for MP4)
    encodingArgs = [
      '-i', srtFilePath,
      '-t', targetDuration.toFixed(3),
      '-avoid_negative_ts', 'make_zero',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-c:s', 'mov_text',
      '-metadata:s:s:0', 'language=eng',
    ];
  } else if (captionsMode === 'burned' && srtFilePath && fs.existsSync(srtFilePath)) {
    // Burn subtitle filter into video frames
    // Use relative filename in jobDir to prevent complex Windows path escaping issues
    const srtFileName = path.basename(srtFilePath);
    const filterSpec = `subtitles=${srtFileName}:force_style='FontSize=16,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,Outline=1'`;

    encodingArgs = [
      '-t', targetDuration.toFixed(3),
      '-avoid_negative_ts', 'make_zero',
      '-vf', filterSpec,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
    ];
  } else {
    // Standard stream cut
    encodingArgs = [
      '-t', targetDuration.toFixed(3),
      '-avoid_negative_ts', 'make_zero',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
    ];
  }

  const finalArgs = [
    ...baseArgs,
    ...encodingArgs,
    '-threads', '2',
    '-movflags', '+faststart',
    outputVideoPath,
  ];

  logger.info({
    jobDir,
    deltaOffset,
    targetDuration,
    captionsMode,
    outputVideoPath
  }, 'Executing ffmpeg cut and transcode');

  await safeExec(ffmpegBin, finalArgs, {
    cwd: jobDir,
    timeoutMs: 120000,
    abortSignal,
  });

  return outputVideoPath;
}
