import { describe, expect, it } from 'vitest';

import { extractDetailLinks } from '../../src/core/detail';

import detailPageHtml from '../fixtures/detail-page.sample.html?raw';

const DETAIL_URL = 'https://1337x.to/torrent/1234/synthetic/';
const MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef&dn=synthetic';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function extract(html: string): ReturnType<typeof extractDetailLinks> {
  return extractDetailLinks(parse(html), DETAIL_URL);
}

describe('extractDetailLinks', () => {
  it('finds the magnet and the preferred .torrent on the (synthetic) detail page', () => {
    const links = extract(detailPageHtml);

    expect(links.magnet).toBe(MAGNET);
    // The relative, hinted `.torrent` wins over the bare one and is resolved against the detail URL.
    expect(links.torrentUrl).toBe(new URL('downloads/Torrent-Download.torrent', DETAIL_URL).href);
  });

  it('reports a missing magnet as null but still returns the .torrent', () => {
    const links = extract('<a href="/downloads/only-file.torrent">Torrent Download</a>');

    expect(links.magnet).toBeNull();
    expect(links.torrentUrl).toBe(new URL('/downloads/only-file.torrent', DETAIL_URL).href);
  });

  it('reports a missing .torrent as null but still returns the magnet', () => {
    const links = extract('<a href="magnet:?xt=urn:btih:abc">Magnet Download</a>');

    expect(links.magnet).toBe('magnet:?xt=urn:btih:abc');
    expect(links.torrentUrl).toBeNull();
  });

  it('returns nulls when the page has neither link', () => {
    expect(extract('<p>No links here</p>')).toEqual({ magnet: null, torrentUrl: null });
  });

  it('resolves a relative .torrent href against the detail url', () => {
    const links = extract('<a href="files/thing.torrent?x=1">Torrent Download</a>');

    expect(links.torrentUrl).toBe(new URL('files/thing.torrent?x=1', DETAIL_URL).href);
  });

  it('prefers a .torrent anchor whose text mentions torrent or download', () => {
    const links = extract(`
      <a href="/files/a.torrent">just a file</a>
      <a href="/files/b.torrent">Torrent Download</a>
      <a href="/files/c.torrent">Download</a>
    `);

    // b comes first among the hinted anchors, so it beats the bare a.
    expect(links.torrentUrl).toBe(new URL('/files/b.torrent', DETAIL_URL).href);
  });

  it('falls back to the first .torrent when none is hinted', () => {
    const links = extract(`
      <a href="/files/a.torrent">just a file</a>
      <a href="/files/b.torrent">more files</a>
    `);

    expect(links.torrentUrl).toBe(new URL('/files/a.torrent', DETAIL_URL).href);
  });

  it('ignores a .torrent that appears only in the query string', () => {
    const links = extract('<a href="/get/not-a-file?name=file.torrent">Download</a>');

    expect(links.torrentUrl).toBeNull();
  });

  it('ignores hostile hrefs (javascript: and unparseable) rather than throwing', () => {
    const links = extract('<a href="javascript:alert(1)">mag</a><a href="http://">bad</a>');

    expect(links).toEqual({ magnet: null, torrentUrl: null });
  });

  it('keeps the magnet exactly as written and never URL-resolves it', () => {
    const links = extract(`
      <a href="MAGNET:?xt=urn:btih:ABC">one</a>
      <a href="MAGNET:?xt=urn:btih:DEF">two</a>
    `);

    // The first magnet wins, and its uppercase scheme survives verbatim. URL-resolving the href
    // would lowercase the scheme to `magnet:`, so this fails the moment it is resolved.
    expect(links.magnet).toBe('MAGNET:?xt=urn:btih:ABC');
  });
});
