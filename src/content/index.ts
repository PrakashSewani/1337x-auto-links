import type { CachedLinks } from '../core/cache';
import { injectControls } from '../core/controls';
import type { RowControls } from '../core/controls';
import { extractDetailLinks } from '../core/detail';
import type { DetailLinks } from '../core/detail';
import { error, log } from '../core/log';
import type { RequestMessage, ResponseMessage } from '../core/messages';
import { createTaskQueue } from '../core/queue';
import { extractResultRows } from '../core/rows';
import type { ResultRow } from '../core/types';

/**
 * The detail-fetch deadline (D-010): a request that has not settled in this long fails like any
 * other failure and releases its queue slot. The timer covers the request *and* reading the body.
 */
const DETAIL_FETCH_TIMEOUT_MS = 15_000;

interface RowState {
  row: ResultRow;
  controls: RowControls;
  /** The row's resolved links once known, so the click handlers can read them. */
  links: DetailLinks | null;
}

/**
 * The content script's work on a result page (D-004): find the rows, inject the controls, resolve
 * each row from the cache or by fetching its detail page through the bounded queue, and wire the
 * two buttons. Fetching happens here, in the page's own origin, so requests carry the user's session
 * and Cloudflare clearance (D-001). Resolves once every queued fetch has settled.
 */
export async function runContentScript(root: ParentNode, pageUrl: string): Promise<void> {
  const rows = extractResultRows(root, pageUrl);
  log('rows found', rows.length);
  if (rows.length === 0) {
    log('no result rows on this page');
    return;
  }

  const states = injectControls(rows).map<RowState>((controls) => ({
    row: controls.row,
    controls,
    links: null,
  }));

  for (const state of states) {
    state.controls.magnet.addEventListener('click', () => handOffMagnet(state));
    state.controls.torrent.addEventListener('click', () => {
      void saveTorrent(state);
    });
  }

  const cache = await readCache(rows.map((row) => row.id));
  const queue = createTaskQueue();
  /** Writes started off the queued tasks, awaited before this function resolves (D-010). */
  const cacheWrites: Array<Promise<void>> = [];

  let hits = 0;
  let misses = 0;
  for (const state of states) {
    const entry = cache[state.row.id];
    if (entry === undefined) {
      misses += 1;
      // Hovering the row promotes its still-pending fetch, so a row the user is looking at is not
      // fetched last (D-004). The listener is cheap: `mouseenter` fires once per entry, with no
      // per-move work and no polling. A row already fetched (or in flight) is a no-op.
      state.row.row.addEventListener('mouseenter', () => queue.prioritize(state.row.id));
      void queue.add(state.row.id, () => resolveRowDetail(state, cacheWrites));
    } else {
      hits += 1;
      applyLinks(state, { magnet: entry.magnet, torrentUrl: entry.torrentUrl });
    }
  }
  log('cache', { hits, misses });

  await queue.idle();
  // Every write has been sent before the script's work is done (D-010), so none is left in flight
  // when the page is replaced. A failed write is swallowed inside `writeCache`.
  await Promise.all(cacheWrites);
}

function applyLinks(state: RowState, links: DetailLinks): void {
  state.links = links;
  state.controls.setLinks(links);
}

/** Fetches a detail page in the page's origin, parses it and reads its links. Throws on failure. */
async function fetchDetailLinks(row: ResultRow): Promise<DetailLinks> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DETAIL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(row.url, {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    return extractDetailLinks(doc, row.url);
  } catch (cause) {
    // Hitting the deadline is an ordinary failure, not a retry (D-010). Any other rejection passes
    // through unchanged; only the timer ever aborts this controller, so the flag means the deadline.
    if (controller.signal.aborted) {
      throw new Error(`timed out after ${DETAIL_FETCH_TIMEOUT_MS / 1000}s`, { cause });
    }
    throw cause;
  } finally {
    clearTimeout(deadline);
  }
}

async function resolveRowDetail(state: RowState, cacheWrites: Array<Promise<void>>): Promise<void> {
  log('fetching detail', state.row.id, state.row.url);

  let links: DetailLinks;
  try {
    links = await fetchDetailLinks(state.row);
  } catch (cause) {
    // A failed fetch is never cached, so a later visit retries it. Both buttons report the failure:
    // neither link is known, so the row must not look like it is still loading.
    const message = describe(cause);
    error('detail fetch failed', state.row.id, message);
    state.controls.setUnresolved(message);
    return;
  }

  applyLinks(state, links);
  log('detail resolved', state.row.id, {
    magnet: links.magnet !== null,
    torrent: links.torrentUrl !== null,
  });

  // A page that parsed fine is a result even with no magnet, so it is cached as one. The write is
  // started off the queued task (D-010): the slot belongs to site traffic, not to the worker's
  // whole-store read-modify-write. `runContentScript` awaits every write before it resolves.
  cacheWrites.push(writeCache(state.row.id, links));
}

/**
 * Hands the magnet to the OS torrent client from the page context (D-004) — synchronously, so the
 * click keeps its user activation, and without navigating the results page away.
 */
function handOffMagnet(state: RowState): void {
  const magnet = state.links?.magnet ?? null;
  if (magnet === null) return;

  log('magnet handoff', state.row.id);
  const anchor = document.createElement('a');
  anchor.href = magnet;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function saveTorrent(state: RowState): Promise<void> {
  const torrentUrl = state.links?.torrentUrl ?? null;
  if (torrentUrl === null) return;

  state.controls.setSaving();
  log('torrent download requested', state.row.id, torrentUrl);

  let response: ResponseMessage | undefined;
  try {
    response = await chrome.runtime.sendMessage<RequestMessage, ResponseMessage>({
      type: 'torrent/download',
      url: torrentUrl,
      title: state.row.title,
      id: state.row.id,
    });
  } catch (cause) {
    const message = describe(cause);
    error('torrent download request failed', state.row.id, message);
    state.controls.setFailed(message);
    return;
  }

  // A worker that answers with nothing (see the service worker's own error path) or an
  // unrecognised message is a failure, not a thrown `TypeError`: `?.` keeps it visible.
  if (response?.type !== 'torrent/download/response') {
    const message = 'unexpected worker response';
    error('torrent download failed', state.row.id, message);
    state.controls.setFailed(message);
    return;
  }

  if (response.ok) {
    state.controls.setSaved();
    log('torrent download started', state.row.id, response.downloadId);
    return;
  }

  error('torrent download failed', state.row.id, response.error);
  state.controls.setFailed(response.error);
}

type CacheReadOutcome =
  { ok: true; entries: Record<string, CachedLinks> } | { ok: false; reason: string };

/**
 * Reads the cache, retrying exactly once (D-010): a single blip must not turn every row into a
 * fetch. This is the extension's only retry — a local `chrome.storage` read, never site traffic.
 * A second failure falls back to an empty cache, so every row is fetched as it was before.
 */
async function readCache(ids: string[]): Promise<Record<string, CachedLinks>> {
  const first = await readCacheOnce(ids);
  if (first.ok) return first.entries;

  error('cache read failed, retrying once', first.reason);
  const second = await readCacheOnce(ids);
  if (second.ok) return second.entries;

  error('cache read failed again, fetching every row', second.reason);
  return {};
}

/** One `cache/read` attempt: its entries, or the reason it did not answer with any. */
async function readCacheOnce(ids: string[]): Promise<CacheReadOutcome> {
  try {
    const response = await chrome.runtime.sendMessage<RequestMessage, ResponseMessage>({
      type: 'cache/read',
      ids,
    });
    if (response.type === 'cache/read/response') return { ok: true, entries: response.entries };

    return { ok: false, reason: `unexpected response: ${response.type}` };
  } catch (cause) {
    return { ok: false, reason: describe(cause) };
  }
}

async function writeCache(id: string, links: DetailLinks): Promise<void> {
  try {
    await chrome.runtime.sendMessage<RequestMessage, ResponseMessage>({
      type: 'cache/write',
      id,
      entry: { magnet: links.magnet, torrentUrl: links.torrentUrl, at: Date.now() },
    });
    log('cache write', id);
  } catch (cause) {
    error('cache write failed', id, describe(cause));
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

if (typeof chrome !== 'undefined' && chrome.runtime !== undefined) {
  void runContentScript(document, window.location.href);
}
