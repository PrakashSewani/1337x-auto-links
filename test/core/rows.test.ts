import { describe, expect, it } from 'vitest';

import { extractResultRows, torrentIdFromUrl } from '../../src/core/rows';

// Imported through Vite's `?raw` loader rather than `node:fs` so the suite runs identically in the
// DOM test environment and does not depend on the ambient NODE_ENV.
import searchResultsHtml from '../fixtures/search-results.sample.html?raw';
import realListHtml from '../fixtures/list-page.real.html?raw';

const PAGE_URL = 'https://1337x.to/search/synthetic/1/';
const REAL_PAGE_URL = 'https://1337x.to/popular/movies/';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractResultRows', () => {
  it('reads one row per torrent link with id, absolute url and title', () => {
    const doc = parse(searchResultsHtml);

    expect(
      extractResultRows(doc, PAGE_URL).map(({ id, url, title }) => ({ id, url, title })),
    ).toEqual([
      {
        id: '101',
        url: 'https://1337x.to/torrent/101/first-synthetic-torrent/',
        title: 'First Synthetic Torrent',
      },
      {
        id: '202',
        url: 'https://1337x.to/torrent/202/second-synthetic-torrent/',
        title: 'Second Synthetic Torrent',
      },
      {
        id: '303',
        url: 'https://1337x.to/torrent/303/third-synthetic-torrent/',
        title: 'Third Synthetic Torrent',
      },
    ]);
  });

  it('collapses a torrent id that appears twice into a single row', () => {
    const rows = extractResultRows(parse(searchResultsHtml), PAGE_URL);
    const repeated = rows.filter((row) => row.id === '101');

    // The fixture links to id 101 twice; only the first occurrence becomes a row.
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.title).toBe('First Synthetic Torrent');
  });

  it('skips a torrent link that is not inside a row', () => {
    const rows = extractResultRows(parse(searchResultsHtml), PAGE_URL);

    // The fixture's <header> holds a valid-looking /torrent/998/ link outside any <tr>.
    expect(rows.map((row) => row.id)).toEqual(['101', '202', '303']);
  });

  it('trims surrounding whitespace from the extracted title', () => {
    const rows = extractResultRows(parse(searchResultsHtml), PAGE_URL);
    const third = rows.find((row) => row.id === '303');

    expect(third?.title).toBe('Third Synthetic Torrent');
  });

  it('returns [] when the page has no results table', () => {
    const doc = parse('<!doctype html><html><body><p>No results found.</p></body></html>');

    expect(extractResultRows(doc, PAGE_URL)).toEqual([]);
  });

  it('carries the row, title link and name cell for each result', () => {
    const doc = parse(realListHtml);
    const [row] = extractResultRows(doc, REAL_PAGE_URL);

    expect(row?.row.tagName).toBe('TR');
    expect(row?.link.tagName).toBe('A');
    expect(row?.link.closest('tr')).toBe(row?.row);
    expect(row?.nameCell?.classList.contains('coll-1')).toBe(true);
    expect(row?.nameCell?.contains(row?.link ?? null)).toBe(true);
  });
});

describe('torrentIdFromUrl', () => {
  it('reads the numeric id from a detail-page URL', () => {
    expect(torrentIdFromUrl('https://1337x.to/torrent/1234567/some-name/')).toBe('1234567');
  });

  it('returns null for URLs that are not torrent detail pages', () => {
    expect(torrentIdFromUrl('https://1337x.to/search/synthetic/1/')).toBeNull();
    expect(torrentIdFromUrl('not a url')).toBeNull();
  });
});
