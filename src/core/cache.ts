/**
 * The resolved-links cache: a whole successful resolution per torrent id, in the extension's local
 * storage, pruned to a fixed cap so it cannot grow without bound (D-004). Failures are never stored.
 */
export interface CachedLinks {
  magnet: string | null;
  torrentUrl: string | null;
  /** Epoch milliseconds of the write — the ordering `pruneCache` keeps the newest by. */
  at: number;
}

/** The single extension-local storage key the whole cache lives under. */
export const CACHE_STORAGE_KEY = '1337x-auto-links:cache';

/** Roughly ten 50-row result pages' worth of resolutions. */
export const CACHE_MAX_ENTRIES = 500;

/** Keeps the newest `max` entries by `at` and drops the rest. Does not mutate its input. */
export function pruneCache(
  entries: Record<string, CachedLinks>,
  max: number = CACHE_MAX_ENTRIES,
): Record<string, CachedLinks> {
  const keys = Object.keys(entries);
  if (keys.length <= max) return { ...entries };

  const newest = keys
    .map((id) => ({ id, entry: entries[id] as CachedLinks }))
    .sort((a, b) => b.entry.at - a.entry.at)
    .slice(0, max);

  const kept: Record<string, CachedLinks> = {};
  for (const { id, entry } of newest) {
    kept[id] = entry;
  }
  return kept;
}
