import { CACHE_MAX_ENTRIES, CACHE_STORAGE_KEY, pruneCache } from '../core/cache';
import type { CachedLinks } from '../core/cache';
import { torrentFilename } from '../core/filename';
import { error, log } from '../core/log';
import { isRequestMessage } from '../core/messages';
import type {
  CacheReadRequest,
  CacheReadResponse,
  CacheWriteRequest,
  CacheWriteResponse,
  RequestMessage,
  ResponseMessage,
  TorrentDownloadRequest,
  TorrentDownloadResponse,
} from '../core/messages';

type CacheStore = Record<string, CachedLinks>;

/**
 * Serialises `cache/write` (D-010) so two concurrent messages cannot interleave their
 * `loadStore()` → `set()` read-modify-write and lose an entry. Each write chains onto the previous
 * one; a failed write settles the chain rather than poisoning it, so the writes behind it still run.
 */
let writeChain: Promise<unknown> = Promise.resolve();

function queueCacheWrite(request: CacheWriteRequest): Promise<CacheWriteResponse> {
  const run = writeChain.then(() => writeCache(request));
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * The service worker's request handler. Owns everything the page cannot do: the `chrome.storage`
 * cache and saving a `.torrent` through `chrome.downloads`. It never fetches 1337x (D-001): the
 * content script owns all site traffic.
 */
export function handleRequest(message: RequestMessage): Promise<ResponseMessage> {
  switch (message.type) {
    case 'cache/read':
      return readCache(message);
    case 'cache/write':
      return queueCacheWrite(message);
    case 'torrent/download':
      return downloadTorrent(message);
  }
}

async function readCache(request: CacheReadRequest): Promise<CacheReadResponse> {
  const store = await loadStore();

  const entries: CacheStore = {};
  for (const id of request.ids) {
    const entry = store[id];
    if (entry !== undefined) entries[id] = entry;
  }

  log('cache read', `${Object.keys(entries).length}/${request.ids.length} hit`);
  return { type: 'cache/read/response', entries };
}

async function writeCache(request: CacheWriteRequest): Promise<CacheWriteResponse> {
  const store = await loadStore();
  const pruned = pruneCache({ ...store, [request.id]: request.entry }, CACHE_MAX_ENTRIES);

  await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: pruned });
  log('cache write', request.id, `${Object.keys(pruned).length} entries`);

  return { type: 'cache/write/response' };
}

async function downloadTorrent(request: TorrentDownloadRequest): Promise<TorrentDownloadResponse> {
  const filename = torrentFilename(request.title, request.id);
  log('download request', filename, request.url);

  try {
    const downloadId = await chrome.downloads.download({ url: request.url, filename });
    log('download started', filename, downloadId);
    return { type: 'torrent/download/response', ok: true, downloadId };
  } catch (cause) {
    // A blocked or rejected download becomes a failure response, never an unhandled rejection.
    const message = describe(cause);
    error('download failed', filename, message);
    return { type: 'torrent/download/response', ok: false, error: message };
  }
}

async function loadStore(): Promise<CacheStore> {
  const stored = await chrome.storage.local.get<Record<string, unknown>>(CACHE_STORAGE_KEY);
  const value = stored[CACHE_STORAGE_KEY];
  return isCacheStore(value) ? value : {};
}

function isCacheStore(value: unknown): value is CacheStore {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function registerMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRequestMessage(message)) return;

    handleRequest(message).then(
      (response) => sendResponse(response),
      (cause: unknown) => {
        error('message handler failed', cause);
        sendResponse(undefined);
      },
    );

    // Keep the message channel open until the async response is sent.
    return true;
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime !== undefined) {
  registerMessageHandler();
}
