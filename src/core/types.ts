/**
 * A single row of a 1337x results table: the data the extension needs plus the elements it was
 * read from, so a consumer can act on the row without locating it a second time.
 *
 * `url` is always absolute (resolved against the results page URL) so consumers do not have to
 * know where the link was found.
 */
export interface ResultRow {
  /** Numeric id from the `/torrent/<id>/...` path. */
  id: string;
  /** Absolute detail-page URL, e.g. `https://1337x.to/torrent/1234/name/`. */
  url: string;
  /** Visible link text for the row. */
  title: string;
  /** The `<tr>` the title link was found in. */
  row: HTMLTableRowElement;
  /** The title link itself — the anchor whose text is `title`. */
  link: HTMLAnchorElement;
  /** The row's `td.coll-1.name` cell, or `null` when the row has none (D-003). */
  nameCell: HTMLTableCellElement | null;
}
