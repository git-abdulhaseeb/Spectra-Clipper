import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_TOKEN: z.string().min(8, 'API_TOKEN must be at least 8 characters long').default('clipper-private-secret-key-2026'),
  SCRATCH_DIR: z.string().default('./scratch'),
  MAX_CONCURRENT_JOBS: z.coerce.number().min(1).max(4).default(1),
  MAX_QUEUE_DEPTH: z.coerce.number().min(1).max(20).default(3),
  MAX_CLIP_DURATION_SEC: z.coerce.number().min(5).max(600).default(300),
  MIN_FREE_DISK_MB: z.coerce.number().default(process.env.VERCEL ? 100 : 1500),
  FFMPEG_PATH: z.string().optional(),
  YTDLP_PATH: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid configuration environment variables:', parsed.error.format());
  process.exit(1);
}

const rawConfig = parsed.data;

// Resolve scratch directory to absolute path (always use /tmp in serverless)
const scratchDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'scratch')
  : path.resolve(rawConfig.SCRATCH_DIR);

try {
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
} catch (err) {
  console.warn('Warning: Could not create scratch directory:', err);
}

// Resolve ffmpeg binary
function resolveFfmpegPath(): string {
  if (rawConfig.FFMPEG_PATH && fs.existsSync(rawConfig.FFMPEG_PATH)) {
    return rawConfig.FFMPEG_PATH;
  }
  try {
    // Attempt to require ffmpeg-static
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch (_) {}

  return 'ffmpeg';
}

// Resolve yt-dlp binary
function resolveYtDlpPath(): { command: string; argsPrefix: string[] } {
  if (rawConfig.YTDLP_PATH && fs.existsSync(rawConfig.YTDLP_PATH)) {
    return { command: rawConfig.YTDLP_PATH, argsPrefix: [] };
  }

  // Check Windows Roaming Python Scripts location
  const appData = process.env.APPDATA || '';
  const candidateWinYtDlp = path.join(appData, 'Python', 'Python314', 'Scripts', 'yt-dlp.exe');
  if (fs.existsSync(candidateWinYtDlp)) {
    return { command: candidateWinYtDlp, argsPrefix: [] };
  }

  // Fallback to python module execution if python exists
  return { command: 'python', argsPrefix: ['-m', 'yt_dlp'] };
}

export const config = {
  ...rawConfig,
  SCRATCH_DIR: scratchDir,
  FFMPEG_RESOLVED_PATH: resolveFfmpegPath(),
  YTDLP_RESOLVED: resolveYtDlpPath(),
};
