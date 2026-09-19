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
      void queue.add(state.row.id, () => resolveRowDetail(state));
    } else {
      hits += 1;
      applyLinks(state, { magnet: entry.magnet, torrentUrl: entry.torrentUrl });
    }
  }
  log('cache', { hits, misses });

  await queue.idle();
}

function applyLinks(state: RowState, links: DetailLinks): void {
  state.links = links;
  state.controls.setLinks(links);
}

/** Fetches a detail page in the page's origin, parses it and reads its links. Throws on failure. */
async function fetchDetailLinks(row: ResultRow): Promise<DetailLinks> {
  const response = await fetch(row.url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  return extractDetailLinks(doc, row.url);
}

async function resolveRowDetail(state: RowState): Promise<void> {
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

  // A page that parsed fine is a result even with no magnet, so it is cached as one.
  await writeCache(state.row.id, links);
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

async function readCache(ids: string[]): Promise<Record<string, CachedLinks>> {
  try {
    const response = await chrome.runtime.sendMessage<RequestMessage, ResponseMessage>({
      type: 'cache/read',
      ids,
    });
    if (response.type === 'cache/read/response') return response.entries;

    error('unexpected cache read response', response.type);
    return {};
  } catch (cause) {
    error('cache read failed', describe(cause));
    return {};
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
