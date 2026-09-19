import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleRequest } from '../../src/background/index';
import { CACHE_MAX_ENTRIES, CACHE_STORAGE_KEY } from '../../src/core/cache';
import type { CachedLinks } from '../../src/core/cache';

type Store = Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fake extension environment: an in-memory storage area and a `chrome.downloads` stub. */
function installChrome(initial: Store = {}) {
  const store: Store = { ...initial };
  const download = vi.fn<(options: { url: string; filename: string }) => Promise<number>>(() =>
    Promise.resolve(7),
  );
  const local = {
    get: vi.fn(() => Promise.resolve({ ...store })),
    set: vi.fn((items: Store) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
  };

  vi.stubGlobal('chrome', { storage: { local }, downloads: { download } });
  return { store, download };
}

function entry(at: number): CachedLinks {
  return { magnet: null, torrentUrl: null, at };
}

describe('background handleRequest', () => {
  it('answers a cache read with only the ids that are cached', async () => {
    installChrome({ [CACHE_STORAGE_KEY]: { a: entry(1), b: entry(2) } });

    const response = await handleRequest({ type: 'cache/read', ids: ['a', 'c'] });

    expect(response).toEqual({ type: 'cache/read/response', entries: { a: entry(1) } });
  });

  it('writes a cache entry and prunes to the cap, keeping the newest', async () => {
    const seed: Record<string, CachedLinks> = {};
    for (let i = 0; i < CACHE_MAX_ENTRIES; i += 1) seed[`old-${i}`] = entry(i);
    const { store } = installChrome({ [CACHE_STORAGE_KEY]: seed });

    const fresh = entry(CACHE_MAX_ENTRIES + 1);
    const response = await handleRequest({ type: 'cache/write', id: 'new', entry: fresh });

    expect(response).toEqual({ type: 'cache/write/response' });
    const saved = store[CACHE_STORAGE_KEY] as Record<string, CachedLinks>;
    expect(Object.keys(saved)).toHaveLength(CACHE_MAX_ENTRIES);
    expect(saved.new).toEqual(fresh);
    // The oldest entry (at 0) was dropped; the newest survived.
    expect(saved['old-0']).toBeUndefined();
  });

  it('downloads a torrent with a sanitised filename and reports the download id', async () => {
    const { download } = installChrome();

    const response = await handleRequest({
      type: 'torrent/download',
      url: 'https://1337x.to/downloads/a.torrent',
      title: 'Some Movie/Messy  Name',
      id: '5',
    });

    expect(response).toEqual({ type: 'torrent/download/response', ok: true, downloadId: 7 });
    expect(download).toHaveBeenCalledWith({
      url: 'https://1337x.to/downloads/a.torrent',
      filename: 'Some Movie Messy Name.torrent',
    });
  });

  it('turns a download failure into an error response rather than rejecting', async () => {
    const { download } = installChrome();
    download.mockRejectedValueOnce(new Error('Download blocked'));

    const response = await handleRequest({
      type: 'torrent/download',
      url: 'https://1337x.to/downloads/a.torrent',
      title: 'A Torrent',
      id: '5',
    });

    expect(response).toEqual({
      type: 'torrent/download/response',
      ok: false,
      error: 'Download blocked',
    });
  });
});
