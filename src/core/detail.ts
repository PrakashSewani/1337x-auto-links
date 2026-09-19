/**
 * The links a torrent's own detail page carries, per D-004: found by shape rather than by class,
 * because the detail page markup has never been captured and 1337x reshuffles its classes.
 */
export interface DetailLinks {
  /** The magnet URI exactly as the page wrote it, or `null` when the page has none. */
  magnet: string | null;
  /** The `.torrent` file URL, absolute, or `null` when the page has none. */
  torrentUrl: string | null;
}

const MAGNET_SCHEME = /^magnet:/i;
/** A download file is identified by its href *path*: query strings and fragments do not count. */
const TORRENT_PATH = /\.torrent$/i;
/** Among several `.torrent` anchors, the one whose text says this is the intended download. */
const TORRENT_HINT = /torrent|download/i;
const JAVASCRIPT_SCHEME = /^javascript:/i;

/**
 * Reads the magnet and `.torrent` links out of a parsed detail page.
 *
 * Looseness is deliberate (D-004): the magnet is the first anchor whose href starts with `magnet:`,
 * never URL-resolved; the `.torrent` is the first anchor whose href path ends in `.torrent`,
 * preferring one whose text mentions torrent or download. Either may be missing. Hostile or
 * unparseable hrefs are skipped rather than thrown on, and this never throws.
 */
export function extractDetailLinks(doc: Document, detailUrl: string): DetailLinks {
  let magnet: string | null = null;
  let firstTorrent: string | null = null;
  let preferredTorrent: string | null = null;

  for (const anchor of doc.querySelectorAll('a')) {
    try {
      const href = anchor.getAttribute('href')?.trim() ?? '';
      if (href === '' || JAVASCRIPT_SCHEME.test(href)) continue;

      if (magnet === null && MAGNET_SCHEME.test(href)) {
        magnet = href;
      }

      if (preferredTorrent === null) {
        const url = new URL(href, detailUrl);
        if (TORRENT_PATH.test(url.pathname)) {
          if (firstTorrent === null) firstTorrent = url.href;
          if (TORRENT_HINT.test(anchor.textContent ?? '')) preferredTorrent = url.href;
        }
      }
    } catch {
      // A href that cannot be parsed is not a result; keep scanning the rest of the page.
    }
  }

  return { magnet, torrentUrl: preferredTorrent ?? firstTorrent };
}
