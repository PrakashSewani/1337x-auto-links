import type { ResultRow } from './types';

/**
 * Any link into a torrent detail page. Kept deliberately loose: we key off the URL shape rather
 * than a class chain that would rot, because 1337x reshuffles its classes. The captured structure
 * this is held to lives in `test/fixtures/list-page.real.html`.
 */
const TORRENT_LINK_SELECTOR = 'a[href*="/torrent/"]';

/** The row's name cell — where D-003 says the controls belong. */
const NAME_CELL_SELECTOR = 'td.coll-1.name';

const TORRENT_PATH = /\/torrent\/(\d+)/;

/** Numeric torrent id from a `/torrent/<id>/...` URL, or `null` if the URL is not one. */
export function torrentIdFromUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return TORRENT_PATH.exec(pathname)?.[1] ?? null;
}

/**
 * Result rows found under `root`, one per torrent link, deduplicated by id.
 *
 * Structure-tolerant by design: a "row" is any element that is a `<tr>` ancestor of a torrent
 * link, so header/ad rows without such a link are skipped. Returns `[]` for pages with no
 * results table. Each row also carries the elements it was read from — the `<tr>`, the title link
 * and the name cell (or `null`) — so a consumer does not have to locate them again.
 */
export function extractResultRows(root: ParentNode, pageUrl: string): ResultRow[] {
  const rows: ResultRow[] = [];
  const seen = new Set<string>();

  for (const link of root.querySelectorAll<HTMLAnchorElement>(TORRENT_LINK_SELECTOR)) {
    const row = link.closest<HTMLTableRowElement>('tr');
    if (row === null) continue;

    const href = link.getAttribute('href');
    const url = href === null ? null : toAbsoluteUrl(href, pageUrl);
    if (url === null) continue;

    const id = torrentIdFromUrl(url);
    if (id === null || seen.has(id)) continue;

    seen.add(id);
    rows.push({
      id,
      url,
      title: link.textContent?.trim() ?? '',
      row,
      link,
      nameCell: link.closest<HTMLTableCellElement>(NAME_CELL_SELECTOR),
    });
  }

  return rows;
}

function toAbsoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}
