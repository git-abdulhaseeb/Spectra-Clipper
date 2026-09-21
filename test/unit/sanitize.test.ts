import { describe, it, expect } from 'vitest';
import path from 'path';
import { sanitizeFilename, createContentDisposition, assertSafePath } from '../../src/utils/sanitize';

describe('Filename and path security sanitization', () => {
  it('strips dangerous path and control characters from filenames', () => {
    const dangerous = '../../etc/passwd: "Dangerous" * <File> | ?';
    const clean = sanitizeFilename(dangerous);
    expect(clean).not.toContain('..');
    expect(clean).not.toContain('/');
    expect(clean).not.toContain('\\');
    expect(clean).not.toContain(':');
    expect(clean).not.toContain('*');
    expect(clean).not.toContain('?');
    expect(clean).not.toContain('<');
    expect(clean).not.toContain('>');
    expect(clean).not.toContain('|');
    expect(clean.endsWith('.mp4')).toBe(true);
  });

  it('replaces reserved Windows device names', () => {
    expect(sanitizeFilename('CON')).toBe('clip.mp4');
    expect(sanitizeFilename('aux')).toBe('clip.mp4');
    expect(sanitizeFilename('NUL')).toBe('clip.mp4');
  });

  it('generates RFC 5987 Content-Disposition header with safe ASCII fallback and UTF-8 encoding', () => {
    const title = 'Clip: "Awesome" 🚀';
    const header = createContentDisposition(title);
    expect(header).toContain('attachment; filename="');
    expect(header).toContain('filename*=UTF-8\'\'');
  });

  it('detects and blocks path traversal attempts', () => {
    const baseDir = path.resolve('/var/clipper/scratch');
    const safeTarget = path.resolve(baseDir, 'uuid-1234/output.mp4');
    const maliciousTarget = path.resolve(baseDir, '../../etc/passwd');

    expect(assertSafePath(baseDir, safeTarget)).toBe(safeTarget);
    expect(() => assertSafePath(baseDir, maliciousTarget)).toThrow(/Path traversal violation/);
  });
});
