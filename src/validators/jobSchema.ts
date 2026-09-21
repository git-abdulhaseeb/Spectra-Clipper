import { z } from 'zod';
import { config } from '../config';

export const CreateJobSchema = z.object({
  videoId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid YouTube Video ID format (must be 11 characters alphanumeric/_-)'),
  title: z.string().optional().default('clip'),
  start: z.number().min(0, 'Start time cannot be negative'),
  end: z.number().min(0.1, 'End time must be greater than 0'),
  maxHeight: z.union([z.literal(360), z.literal(480), z.literal(720), z.literal(1080)]).default(720),
  captionsMode: z.enum(['none', 'soft', 'burned', 'separate_srt']).default('soft'),
  lang: z.string().max(10).optional().default('en'),
  captionData: z.any().optional().nullable(),
}).refine(data => data.end > data.start, {
  message: 'End time must be strictly greater than start time',
  path: ['end'],
}).refine(data => (data.end - data.start) <= config.MAX_CLIP_DURATION_SEC, {
  message: `Clip duration exceeds maximum allowed duration of ${config.MAX_CLIP_DURATION_SEC} seconds`,
  path: ['end'],
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
