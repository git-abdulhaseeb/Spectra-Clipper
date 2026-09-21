import path from 'path';

/**
 * Sanitizes a title for safe usage as a disk filename and HTTP download header.
 * Strips path traversal characters, control characters, Windows reserved names, and non-ASCII.
 */
export function sanitizeFilename(name: string, fallback = 'clip'): string {
  if (!name || typeof name !== 'string') return `${fallback}.mp4`;

  // Remove control characters and null bytes
  let clean = name.replace(/[\x00-\x1f\x7f]/g, '');

  // Strip Windows / Linux illegal filename characters: \ / : * ? " < > |
  clean = clean.replace(/[\\/:*?"<>|]/g, '_');

  // Replace common Unicode punctuation (en-dash, em-dash, smart quotes) with ASCII
  clean = clean
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

  // Strip non-ASCII characters for strict HTTP header compatibility
  clean = clean.replace(/[^\x20-\x7E]/g, '');

  // Replace whitespace sequences and collapse multiple underscores
  clean = clean.replace(/\s+/g, '_').replace(/_+/g, '_');

  // Remove leading/trailing dots and underscores
  clean = clean.replace(/^[._]+|[._]+$/g, '');

  // Filter out Windows reserved filenames
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(clean) || !clean) {
    clean = fallback;
  }

  // Clamp length
  if (clean.length > 64) {
    clean = clean.substring(0, 64);
  }

  return clean.endsWith('.mp4') ? clean : `${clean}.mp4`;
}

/**
 * Generates an RFC 5987 and RFC 6266 compliant Content-Disposition header.
 * Provides both an ASCII-safe fallback and a UTF-8 percent-encoded filename*.
 */
export function createContentDisposition(rawFilename: string): string {
  const safeAscii = sanitizeFilename(rawFilename);
  const encodedUtf8 = encodeURIComponent(rawFilename).replace(/['()]/g, escape);

  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedUtf8}`;
}

/**
 * Validates that a target file path resides strictly within the allowed base directory.
 * Throws an error if path traversal is detected.
 */
export function assertSafePath(baseDir: string, targetPath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error(`Path traversal violation: Target path [${resolvedTarget}] is outside base directory [${resolvedBase}]`);
  }

  return resolvedTarget;
}
