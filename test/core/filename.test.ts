import { describe, expect, it } from 'vitest';

import { torrentFilename } from '../../src/core/filename';

describe('torrentFilename', () => {
  it('keeps a plain title and adds the .torrent suffix', () => {
    expect(torrentFilename('Some Torrent 2026', '42')).toBe('Some Torrent 2026.torrent');
  });

  it('replaces path separators with spaces', () => {
    expect(torrentFilename('a/b\\c', '42')).toBe('a b c.torrent');
    expect(torrentFilename('../../etc/passwd', '42')).not.toContain('/');
    expect(torrentFilename('../../etc/passwd', '42')).not.toContain('\\');
  });

  it('strips control characters', () => {
    expect(torrentFilename('bad\u0000\u0001name\u007f', '42')).toBe('bad name.torrent');
  });

  it('collapses whitespace and trims', () => {
    expect(torrentFilename('  spaced   out  ', '42')).toBe('spaced out.torrent');
  });

  it('caps the base length but always keeps the .torrent suffix', () => {
    const name = torrentFilename('x'.repeat(200), '42');

    expect(name.endsWith('.torrent')).toBe(true);
    expect(name.slice(0, -'.torrent'.length)).toHaveLength(100);
  });

  it('falls back to the torrent id when nothing usable remains', () => {
    expect(torrentFilename('', '42')).toBe('42.torrent');
    expect(torrentFilename('   ', '42')).toBe('42.torrent');
    expect(torrentFilename('\u0000\u0001', '42')).toBe('42.torrent');
  });
});
