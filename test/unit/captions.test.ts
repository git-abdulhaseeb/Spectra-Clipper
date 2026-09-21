import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { convertJson3ToSrt, TimedTextJson3 } from '../../src/pipeline/captions';

describe('Caption processing and time shifting', () => {
  const testDir = path.resolve(__dirname, '../../test_tmp');
  const testSrtPath = path.join(testDir, 'test.srt');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('correctly shifts events relative to clip start and trims outside events', () => {
    const mockJson3: TimedTextJson3 = {
      events: [
        // Event 1: before clip (0s - 4s) -> Should be excluded
        { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: 'Before clip text' }] },
        // Event 2: overlaps start (8s - 12s) -> Clip starts at 10s -> Should start at 0s in clip, end at 2s
        { tStartMs: 8000, dDurationMs: 4000, segs: [{ utf8: 'Overlapping &amp; start text' }] },
        // Event 3: inside clip (12s - 15s) -> Should start at 2s, end at 5s
        { tStartMs: 12000, dDurationMs: 3000, segs: [{ utf8: 'Inside clip text' }] },
        // Event 4: after clip (25s - 30s) -> Clip ends at 20s -> Should be excluded
        { tStartMs: 25000, dDurationMs: 5000, segs: [{ utf8: 'After clip text' }] },
      ]
    };

    const success = convertJson3ToSrt(mockJson3, 10, 20, testSrtPath);
    expect(success).toBe(true);

    const srtContent = fs.readFileSync(testSrtPath, 'utf-8');
    expect(srtContent).toContain('Overlapping & start text');
    expect(srtContent).toContain('Inside clip text');
    expect(srtContent).not.toContain('Before clip text');
    expect(srtContent).not.toContain('After clip text');

    // First block should start at 00:00:00,000
    expect(srtContent).toContain('00:00:00,000 --> 00:00:02,000');
    // Second block should start at 00:00:02,000
    expect(srtContent).toContain('00:00:02,000 --> 00:00:05,000');
  });

  it('returns false when no events overlap the target range', () => {
    const mockJson3: TimedTextJson3 = {
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] }
      ]
    };

    const success = convertJson3ToSrt(mockJson3, 60, 70, testSrtPath);
    expect(success).toBe(false);
  });
});
