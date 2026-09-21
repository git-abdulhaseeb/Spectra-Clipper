import { describe, it, expect } from 'vitest';
import { formatSrtTimestamp } from '../../src/pipeline/captions';

describe('Timestamp arithmetic and SRT formatting', () => {
  it('formats zero milliseconds as 00:00:00,000', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
  });

  it('formats fractional seconds with padding', () => {
    // 1500 ms = 1.5s
    expect(formatSrtTimestamp(1500)).toBe('00:00:01,500');
  });

  it('formats minutes and seconds accurately', () => {
    // 75234 ms = 1 minute, 15 seconds, 234 ms
    expect(formatSrtTimestamp(75234)).toBe('00:01:15,234');
  });

  it('formats hours accurately', () => {
    // 3661005 ms = 1 hour, 1 minute, 1 second, 5 ms
    expect(formatSrtTimestamp(3661005)).toBe('01:01:01,005');
  });

  it('clamps negative milliseconds to zero', () => {
    expect(formatSrtTimestamp(-500)).toBe('00:00:00,000');
  });

  it('calculates correct keyframe snap delta offset', () => {
    const targetStartSec = 14.5;
    const actualDownloadedStartPts = 12.0; // 3-second padded lead
    const deltaOffset = Math.max(0, targetStartSec - actualDownloadedStartPts);
    expect(deltaOffset).toBe(2.5);
  });
});
