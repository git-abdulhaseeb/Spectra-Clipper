import fs from 'fs';

export interface TimedTextJson3 {
  events?: Array<{
    tStartMs: number;
    dDurationMs?: number;
    segs?: Array<{ utf8: string }>;
  }>;
}

/**
 * Converts milliseconds to SubRip (.srt) timestamp format: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const milliseconds = safeMs % 1000;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');
  const msStr = String(milliseconds).padStart(3, '0');

  return `${hStr}:${mStr}:${sStr},${msStr}`;
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Parses YouTube's json3 timed-text structure, trims to clip interval,
 * shifts timestamps relative to clip start, and generates a valid SRT file.
 */
export function convertJson3ToSrt(
  json3: TimedTextJson3,
  clipStartSec: number,
  clipEndSec: number,
  outputSrtPath: string
): boolean {
  if (!json3?.events || !Array.isArray(json3.events)) {
    return false;
  }

  const clipStartMs = clipStartSec * 1000;
  const clipEndMs = clipEndSec * 1000;
  const srtBlocks: string[] = [];
  let index = 1;

  for (const event of json3.events) {
    if (!event.segs || !event.tStartMs) continue;

    const eventStartMs = event.tStartMs;
    const eventDurationMs = event.dDurationMs || 2000;
    const eventEndMs = eventStartMs + eventDurationMs;

    // Check overlap with clip time range
    if (eventEndMs <= clipStartMs || eventStartMs >= clipEndMs) {
      continue;
    }

    // Shift relative to clip start
    const shiftedStartMs = Math.max(0, eventStartMs - clipStartMs);
    const shiftedEndMs = Math.min((clipEndSec - clipStartSec) * 1000, eventEndMs - clipStartMs);

    if (shiftedEndMs <= shiftedStartMs) continue;

    const rawText = event.segs.map(s => s.utf8 || '').join('');
    const cleanText = unescapeHtml(rawText);
    if (!cleanText) continue;

    const timeHeader = `${formatSrtTimestamp(shiftedStartMs)} --> ${formatSrtTimestamp(shiftedEndMs)}`;
    srtBlocks.push(`${index}\n${timeHeader}\n${cleanText}\n`);
    index++;
  }

  if (srtBlocks.length === 0) {
    return false;
  }

  fs.writeFileSync(outputSrtPath, srtBlocks.join('\n'), 'utf-8');
  return true;
}
