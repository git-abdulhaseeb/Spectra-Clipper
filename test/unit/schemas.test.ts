import { describe, it, expect } from 'vitest';
import { CreateJobSchema } from '../../src/validators/jobSchema';

describe('Job creation schema validation', () => {
  it('accepts valid job input', () => {
    const valid = {
      videoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      start: 10,
      end: 25,
      maxHeight: 720,
      captionsMode: 'soft',
    };

    const result = CreateJobSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid video ID (SSRF / command injection prevention)', () => {
    const invalidIds = [
      'https://www.youtube.com/watch?v=123',
      '; rm -rf /',
      'abc',
      'dQw4w9WgXcQ123', // too long
      '../etc/passwd'
    ];

    for (const badId of invalidIds) {
      const result = CreateJobSchema.safeParse({
        videoId: badId,
        start: 0,
        end: 10,
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects inverted or identical timestamps', () => {
    const inverted = CreateJobSchema.safeParse({
      videoId: 'dQw4w9WgXcQ',
      start: 20,
      end: 10,
    });
    expect(inverted.success).toBe(false);

    const identical = CreateJobSchema.safeParse({
      videoId: 'dQw4w9WgXcQ',
      start: 10,
      end: 10,
    });
    expect(identical.success).toBe(false);
  });

  it('rejects clip duration exceeding maximum allowed 300 seconds', () => {
    const tooLong = CreateJobSchema.safeParse({
      videoId: 'dQw4w9WgXcQ',
      start: 0,
      end: 301,
    });
    expect(tooLong.success).toBe(false);
  });
});
