import type { CachedLinks } from './cache';

/**
 * The content-script ↔ service-worker protocol, defined once and imported by both sides. A request
 * is one of three shapes; every response is tagged with the request it answers so the caller can
 * narrow it. Kept in `src/core/` so it carries no browser-API reference.
 */

export interface CacheReadRequest {
  type: 'cache/read';
  /** Every id the page wants a cached resolution for — read in one message, not one per row. */
  ids: string[];
}

export interface CacheWriteRequest {
  type: 'cache/write';
  id: string;
  /** The whole successful resolution; a failure is never sent. */
  entry: CachedLinks;
}

export interface TorrentDownloadRequest {
  type: 'torrent/download';
  url: string;
  /** The row title the worker sanitises into the download's filename, with `id` as its fallback. */
  title: string;
  id: string;
}

export type RequestMessage = CacheReadRequest | CacheWriteRequest | TorrentDownloadRequest;

export interface CacheReadResponse {
  type: 'cache/read/response';
  /** One entry per id that was cached; ids that missed are simply absent. */
  entries: Record<string, CachedLinks>;
}

export interface CacheWriteResponse {
  type: 'cache/write/response';
}

export interface TorrentDownloadSuccessResponse {
  type: 'torrent/download/response';
  ok: true;
  downloadId: number;
}

export interface TorrentDownloadFailureResponse {
  type: 'torrent/download/response';
  ok: false;
  /** A message safe to show the user on the button's title. */
  error: string;
}

export type TorrentDownloadResponse =
  TorrentDownloadSuccessResponse | TorrentDownloadFailureResponse;

export type ResponseMessage = CacheReadResponse | CacheWriteResponse | TorrentDownloadResponse;

const REQUEST_TYPES = ['cache/read', 'cache/write', 'torrent/download'] as const;

/** Narrows an arbitrary extension-message payload to one of our requests. */
export function isRequestMessage(message: unknown): message is RequestMessage {
  if (typeof message !== 'object' || message === null) return false;
  const { type } = message as { type?: unknown };
  return REQUEST_TYPES.some((known) => known === type);
}
