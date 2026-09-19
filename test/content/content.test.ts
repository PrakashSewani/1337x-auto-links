import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CachedLinks } from '../../src/core/cache';
import type {
  CacheWriteRequest,
  RequestMessage,
  ResponseMessage,
  TorrentDownloadRequest,
} from '../../src/core/messages';
import { runContentScript } from '../../src/content/index';

import realListHtml from '../fixtures/list-page.real.html?raw';

const PAGE_URL = 'https://1337x.to/popular/movies/';
const THIRD_ROW_URL =
  'https://1337x.to/torrent/6722815/Quantum-Supremacy-2025-1080p-WEB-DL-H264-PlayfulDarkness/';

// Each row cached with both links, so a click test resolves from the cache with no fetch.
const CACHED_ROWS: Record<string, CachedLinks> = {
  '6722910': {
    magnet: 'magnet:?xt=urn:btih:1111111111',
    torrentUrl: 'https://1337x.to/downloads/first.torrent',
    at: 1,
  },
  '6722705': {
    magnet: 'magnet:?xt=urn:btih:2222222222',
    torrentUrl: 'https://1337x.to/downloads/second.torrent',
    at: 2,
  },
  '6722815': {
    magnet: 'magnet:?xt=urn:btih:3333333333',
    torrentUrl: 'https://1337x.to/downloads/third.torrent',
    at: 3,
  },
};

// The content script's own guard (`typeof chrome !== 'undefined'`) runs at import time, before any
// test stubs `chrome`, so importing the module here has no side effect.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function parseListPage(): Document {
  return new DOMParser().parseFromString(realListHtml, 'text/html');
}

/** A small synthetic results page with one row per id, all relative to `PAGE_URL`. */
function listPageWith(ids: string[]): Document {
  const rows = ids
    .map(
      (id) =>
        `<tr><td class="coll-1 name"><a href="/torrent/${id}/name/">Name ${id}</a></td><td class="coll-2">1</td></tr>`,
    )
    .join('');
  return new DOMParser().parseFromString(`<table><tbody>${rows}</tbody></table>`, 'text/html');
}

function htmlResponse(html: string): Response {
  return { ok: true, status: 200, text: () => Promise.resolve(html) } as unknown as Response;
}

/** Resolves a pending promise from the test, so a request can be observed while it is in flight. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets the microtasks a click handler queued run before the assertion. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function buttonAt(doc: Document, selector: string, index: number): HTMLButtonElement {
  const button = doc.querySelectorAll<HTMLButtonElement>(selector)[index];
  if (button === undefined) throw new Error(`expected a ${selector} at index ${index}`);
  return button;
}

/** The `data-icon` marker of the glyph currently rendered on a button. */
function glyphOf(button: HTMLButtonElement): string | null {
  return button.querySelector('svg')?.getAttribute('data-icon') ?? null;
}

/** A fake worker that answers cache reads from `entries`, accepts writes, and defers downloads. */
function installChrome(
  entries: Record<string, CachedLinks>,
  onDownload: (message: TorrentDownloadRequest) => Promise<ResponseMessage> = () =>
    Promise.resolve({ type: 'torrent/download/response', ok: true, downloadId: 1 }),
) {
  const sendMessage = vi.fn((message: RequestMessage): Promise<ResponseMessage> => {
    if (message.type === 'cache/read') {
      const found: Record<string, CachedLinks> = {};
      for (const id of message.ids) {
        const entry = entries[id];
        if (entry !== undefined) found[id] = entry;
      }
      return Promise.resolve({ type: 'cache/read/response', entries: found });
    }
    if (message.type === 'cache/write') {
      return Promise.resolve({ type: 'cache/write/response' });
    }
    return onDownload(message);
  });

  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  return sendMessage;
}

function cacheWrites(sendMessage: ReturnType<typeof installChrome>): CacheWriteRequest[] {
  return sendMessage.mock.calls
    .map(([message]) => message)
    .filter((message): message is CacheWriteRequest => message.type === 'cache/write');
}

describe('runContentScript', () => {
  it('does not fetch a row that is already cached', async () => {
    const sendMessage = installChrome({
      '6722910': { magnet: 'magnet:?xt=urn:btih:cached', torrentUrl: null, at: 1 },
      '6722705': { magnet: null, torrentUrl: 'https://1337x.to/cached.torrent', at: 2 },
    });
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(htmlResponse('<html></html>')),
    );
    vi.stubGlobal('fetch', fetchMock);

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);

    // Three rows, two cached: exactly the third is fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(THIRD_ROW_URL);

    // The cached rows were rendered straight from the cache, with no fetch.
    const magnets = doc.querySelectorAll<HTMLButtonElement>('.x-1337x-auto-links-magnet');
    const torrents = doc.querySelectorAll<HTMLButtonElement>('.x-1337x-auto-links-torrent');
    expect(magnets[0]?.disabled).toBe(false);
    expect(glyphOf(magnets[0] as HTMLButtonElement)).toBe('magnet');
    expect(torrents[0]?.disabled).toBe(true);
    expect(torrents[0]?.getAttribute('data-state')).toBe('missing');
    expect(torrents[0]?.title).toBe('no .torrent');
    expect(magnets[1]?.disabled).toBe(true);
    expect(magnets[1]?.getAttribute('data-state')).toBe('missing');
    expect(magnets[1]?.title).toBe('no magnet');
    expect(torrents[1]?.disabled).toBe(false);
    expect(glyphOf(torrents[1] as HTMLButtonElement)).toBe('file');

    // Only the fetched row was written back.
    const writes = cacheWrites(sendMessage);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.id).toBe('6722815');
  });

  it('does not cache a row whose fetch failed', async () => {
    const sendMessage = installChrome({});
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.reject(new Error('blocked')),
    );
    vi.stubGlobal('fetch', fetchMock);

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);

    // Every row is uncached, so all three are fetched and all three fail.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Nothing was written: a failed fetch is never cached, so a later visit retries.
    expect(cacheWrites(sendMessage)).toHaveLength(0);

    // And the failure is visible on the whole row: with neither link known, both buttons say so
    // rather than leaving the magnet looking like it is still loading.
    const magnets = doc.querySelectorAll<HTMLButtonElement>('.x-1337x-auto-links-magnet');
    const torrents = doc.querySelectorAll<HTMLButtonElement>('.x-1337x-auto-links-torrent');
    expect(magnets).toHaveLength(3);
    expect(torrents).toHaveLength(3);
    for (const button of [...magnets, ...torrents]) {
      expect(glyphOf(button)).toBe('alert');
      expect(button.getAttribute('data-state')).toBe('failed');
      expect(button.getAttribute('aria-label')).toBe('blocked');
      expect(button.title).toBe('blocked');
      expect(button.disabled).toBe(true);
    }
  });

  it('caches a successful fetch, even when the page has no magnet', async () => {
    const sendMessage = installChrome({
      '6722910': { magnet: null, torrentUrl: null, at: 1 },
      '6722705': { magnet: null, torrentUrl: null, at: 2 },
    });
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(htmlResponse('<a href="/downloads/only-file.torrent">Torrent Download</a>')),
    );
    vi.stubGlobal('fetch', fetchMock);

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);

    const writes = cacheWrites(sendMessage);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.id).toBe('6722815');
    expect(writes[0]?.entry.magnet).toBeNull();
    expect(writes[0]?.entry.torrentUrl).toBe('https://1337x.to/downloads/only-file.torrent');
    expect(typeof writes[0]?.entry.at).toBe('number');
  });

  it('shows saving… then saved on the .torrent button for a successful download', async () => {
    const download = deferred<ResponseMessage>();
    const sendMessage = installChrome(CACHED_ROWS, () => download.promise);
    const fetchMock = vi.fn(() => Promise.resolve(htmlResponse('<html></html>')));
    vi.stubGlobal('fetch', fetchMock);

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);

    // Every row resolved from the cache, so the click needs no fetch.
    expect(fetchMock).not.toHaveBeenCalled();
    const torrent = buttonAt(doc, '.x-1337x-auto-links-torrent', 0);
    expect(torrent.disabled).toBe(false);

    torrent.click();

    // The request is in flight: the button says so before the worker answers, in its own glyph
    // rather than the idle one it showed a moment ago (D-009).
    expect(glyphOf(torrent)).toBe('file-saving');
    expect(torrent.getAttribute('data-state')).toBe('saving');
    expect(torrent.getAttribute('aria-label')).toBe('saving…');
    expect(torrent.title).toBe('saving…');
    expect(torrent.disabled).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'torrent/download',
      url: 'https://1337x.to/downloads/first.torrent',
      title: 'The Fix 2026 1080p WEBSCR HEVC x265 BONE',
      id: '6722910',
    });

    download.resolve({ type: 'torrent/download/response', ok: true, downloadId: 7 });
    await flush();

    expect(glyphOf(torrent)).toBe('check');
    expect(torrent.getAttribute('data-state')).toBe('saved');
    expect(torrent.getAttribute('aria-label')).toBe('saved');
    expect(torrent.disabled).toBe(true);
  });

  it('shows failed and the reason on the .torrent button for an error response', async () => {
    const download = deferred<ResponseMessage>();
    installChrome(CACHED_ROWS, () => download.promise);

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);

    const torrent = buttonAt(doc, '.x-1337x-auto-links-torrent', 0);
    torrent.click();
    expect(torrent.getAttribute('data-state')).toBe('saving');

    download.resolve({ type: 'torrent/download/response', ok: false, error: 'download blocked' });
    await flush();

    expect(glyphOf(torrent)).toBe('alert');
    expect(torrent.getAttribute('data-state')).toBe('failed');
    expect(torrent.getAttribute('aria-label')).toBe('download blocked');
    expect(torrent.title).toBe('download blocked');
    expect(torrent.disabled).toBe(true);
  });

  it('shows failed when the worker answers with no response instead of leaving saving… up', async () => {
    installChrome(CACHED_ROWS, () => Promise.resolve(undefined as unknown as ResponseMessage));

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);

    const torrent = buttonAt(doc, '.x-1337x-auto-links-torrent', 0);
    torrent.click();
    await flush();

    // A missing response degrades to a visible failure; it must not throw or hang on `saving…`.
    expect(glyphOf(torrent)).toBe('alert');
    expect(torrent.getAttribute('data-state')).toBe('failed');
    expect(torrent.title).toBe('unexpected worker response');
    expect(torrent.disabled).toBe(true);
  });

  it('shows failed when the worker answers with an unrecognised response', async () => {
    installChrome(CACHED_ROWS, () =>
      Promise.resolve({ type: 'cache/read/response', entries: {} } as unknown as ResponseMessage),
    );

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);

    const torrent = buttonAt(doc, '.x-1337x-auto-links-torrent', 0);
    torrent.click();
    await flush();

    expect(glyphOf(torrent)).toBe('alert');
    expect(torrent.getAttribute('data-state')).toBe('failed');
    expect(torrent.title).toBe('unexpected worker response');
    expect(torrent.disabled).toBe(true);
  });

  it('hands the magnet off through a clicked anchor carrying the row href, then removes it', async () => {
    installChrome(CACHED_ROWS);

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);

    const magnet = buttonAt(doc, '.x-1337x-auto-links-magnet', 0);
    expect(magnet.disabled).toBe(false);

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const locationBefore = window.location.href;

    magnet.click();

    // Exactly one handoff anchor was created and clicked...
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    // ...carrying the row's magnet verbatim...
    expect(anchor.getAttribute('href')).toBe('magnet:?xt=urn:btih:1111111111');
    // ...and removed again, so nothing is left behind in the page.
    expect(document.body.contains(anchor)).toBe(false);
    // The results page did not navigate away.
    expect(window.location.href).toBe(locationBefore);
  });
});

describe('runContentScript hover promotion', () => {
  it("starts a hovered unresolved row's fetch before the rows queued ahead of it", async () => {
    installChrome({});
    const fetchOrder: string[] = [];
    const fetchMock = vi.fn((url: string) => {
      fetchOrder.push(url);
      return Promise.resolve(htmlResponse('<html></html>'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const doc = listPageWith(['1', '2', '3', '4']);
    const done = runContentScript(doc, PAGE_URL);
    // Let the cache read resolve and the queue start its first fetch, while 2, 3 and 4 are still
    // pending (the queue's next start is spaced by 300 ms).
    await flush();

    const lastRow = doc.querySelectorAll('tr')[3];
    if (lastRow === undefined) throw new Error('expected four result rows');
    lastRow.dispatchEvent(new MouseEvent('mouseenter'));

    await done;

    // Plain FIFO would be 1, 2, 3, 4; promoting the hovered row moves it ahead of 2 and 3.
    expect(fetchOrder).toEqual([
      'https://1337x.to/torrent/1/name/',
      'https://1337x.to/torrent/4/name/',
      'https://1337x.to/torrent/2/name/',
      'https://1337x.to/torrent/3/name/',
    ]);
  });

  it('does nothing when a resolved row is hovered', async () => {
    installChrome(CACHED_ROWS);
    const fetchMock = vi.fn(() => Promise.resolve(htmlResponse('<html></html>')));
    vi.stubGlobal('fetch', fetchMock);

    const doc = parseListPage();
    await runContentScript(doc, PAGE_URL);
    expect(fetchMock).not.toHaveBeenCalled();

    const magnet = buttonAt(doc, '.x-1337x-auto-links-magnet', 0);
    const row = doc.querySelector('tbody td.coll-1.name')?.closest('tr') ?? null;
    if (row === null) throw new Error('expected a result row');

    row.dispatchEvent(new MouseEvent('mouseenter'));
    await flush();

    // The row was cached, never queued, so hovering it fetches nothing and changes nothing.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(magnet.disabled).toBe(false);
    expect(glyphOf(magnet)).toBe('magnet');
  });
});
