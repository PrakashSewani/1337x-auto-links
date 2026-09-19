import { describe, expect, it } from 'vitest';

import { pruneCache } from '../../src/core/cache';
import type { CachedLinks } from '../../src/core/cache';

function entry(at: number): CachedLinks {
  return { magnet: null, torrentUrl: null, at };
}

describe('pruneCache', () => {
  it('keeps the newest entries when over the cap', () => {
    const entries = { a: entry(1), b: entry(3), c: entry(2), d: entry(4) };

    expect(Object.keys(pruneCache(entries, 2)).sort()).toEqual(['b', 'd']);
  });

  it('keeps the newest by timestamp, not by key order', () => {
    const entries = { z: entry(5), a: entry(9), m: entry(7) };

    expect(Object.keys(pruneCache(entries, 2)).sort()).toEqual(['a', 'm']);
  });

  it('returns every entry when at or under the cap', () => {
    const entries = { a: entry(1), b: entry(2) };

    expect(pruneCache(entries, 5)).toEqual(entries);
  });

  it('does not mutate its input', () => {
    const entries = { a: entry(1), b: entry(2), c: entry(3) };

    pruneCache(entries, 1);

    expect(Object.keys(entries).sort()).toEqual(['a', 'b', 'c']);
  });
});
