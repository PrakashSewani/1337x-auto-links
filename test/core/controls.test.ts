import { describe, expect, it } from 'vitest';

import { injectControls } from '../../src/core/controls';
import type { RowControls } from '../../src/core/controls';
import { SAVING_SPIN_CLASS } from '../../src/core/icons';
import { extractResultRows } from '../../src/core/rows';

import realListHtml from '../fixtures/list-page.real.html?raw';

const PAGE_URL = 'https://1337x.to/search/synthetic/1/';
const REAL_PAGE_URL = 'https://1337x.to/popular/movies/';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`expected to find ${selector}`);
  return element;
}

/** The `data-icon` marker of the glyph currently rendered on a control, or `null` when none is. */
function glyphOf(control: Element): string | null {
  return control.querySelector('svg')?.getAttribute('data-icon') ?? null;
}

function ariaLabel(control: Element): string | null {
  return control.getAttribute('aria-label');
}

/** The layers of a button's glyph that the stylesheet spins while a save is in flight (D-009). */
function spinLayers(button: HTMLButtonElement): Element[] {
  return [...button.querySelectorAll(`.${SAVING_SPIN_CLASS}`)];
}

/** Injects into a one-row page and returns that row's controls. */
function singleControls(rowHtml: string): RowControls {
  const doc = parse(`<table><tbody>${rowHtml}</tbody></table>`);
  const [controls] = injectControls(extractResultRows(doc, PAGE_URL));
  if (controls === undefined) throw new Error('expected controls for the row');
  return controls;
}

const NAME_CELL_ROW = (inner: string): string =>
  `<tr><td class="coll-1 name"><a href="/torrent/7/name/">Name</a>${inner}</td><td class="coll-2">1</td></tr>`;

describe('injectControls placement', () => {
  it('places the container inside the name cell, directly after the title link', () => {
    const doc = parse(realListHtml);
    injectControls(extractResultRows(doc, REAL_PAGE_URL));

    const nameCell = query<HTMLTableCellElement>(doc, 'tbody td.coll-1.name');
    const titleLink = query<HTMLAnchorElement>(nameCell, 'a[href^="/torrent/"]');
    const container = query<HTMLElement>(nameCell, '.x-1337x-auto-links-controls');

    // Inside the name cell...
    expect(nameCell.contains(container)).toBe(true);
    // ...and the title link's own next element, not merely somewhere after it: injection places
    // the container with `insertBefore(container, link.nextSibling)`, so any other insertion point
    // fails here.
    expect(titleLink.nextElementSibling).toBe(container);

    const magnet = query<HTMLAnchorElement>(container, '.x-1337x-auto-links-magnet');
    const torrent = query<HTMLButtonElement>(container, '.x-1337x-auto-links-torrent');
    expect(magnet.tagName).toBe('A');
    expect(magnet.hasAttribute('href')).toBe(false);
    expect(magnet.getAttribute('aria-disabled')).toBe('true');
    expect(glyphOf(magnet)).toBe('magnet');
    expect(ariaLabel(magnet)).toBe('Magnet');
    expect(torrent.type).toBe('button');
    expect(glyphOf(torrent)).toBe('file');
    expect(ariaLabel(torrent)).toBe('Save .torrent file');
    expect(torrent.disabled).toBe(true);
  });

  it('never gives a row a non-cell child', () => {
    const doc = parse(realListHtml);
    injectControls(extractResultRows(doc, REAL_PAGE_URL));

    const rows = [...doc.querySelectorAll('tr')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const child of row.children) {
        expect(['TD', 'TH']).toContain(child.tagName);
      }
    }
  });

  it('does not duplicate the controls when injected twice', () => {
    const doc = parse(realListHtml);
    const rows = extractResultRows(doc, REAL_PAGE_URL);
    injectControls(rows);
    injectControls(rows);

    expect(doc.querySelectorAll('.x-1337x-auto-links-controls')).toHaveLength(rows.length);
    expect(doc.querySelectorAll('.x-1337x-auto-links-magnet')).toHaveLength(rows.length);
  });

  it('returns handles to the same buttons when injected twice', () => {
    const doc = parse(realListHtml);
    const rows = extractResultRows(doc, REAL_PAGE_URL);
    const first = injectControls(rows);
    const second = injectControls(rows);

    expect(second.map((controls) => controls.row.id)).toEqual(first.map((c) => c.row.id));
    expect(second[0]?.magnet).toBe(first[0]?.magnet);
    expect(second[0]?.torrent).toBe(first[0]?.torrent);
  });

  it('skips a row whose torrent link is not inside a name cell', () => {
    const doc = parse(
      '<table><tbody><tr><td class="coll-2 seeds"><a href="/torrent/42/x/">No name cell</a></td></tr></tbody></table>',
    );
    const rows = extractResultRows(doc, PAGE_URL);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.nameCell).toBeNull();

    expect(injectControls(rows)).toEqual([]);

    expect(doc.querySelector('.x-1337x-auto-links-controls')).toBeNull();
    expect(doc.querySelector('tr')?.hasAttribute('data-1337x-auto-links')).toBe(false);
  });

  it('is a no-op on a page with no result rows', () => {
    const doc = parse('<!doctype html><html><body><p>No results found.</p></body></html>');
    const rows = extractResultRows(doc, PAGE_URL);

    expect(rows).toEqual([]);
    expect(injectControls(rows)).toEqual([]);

    expect(doc.querySelector('.x-1337x-auto-links-controls')).toBeNull();
  });
});

describe('RowControls.setLinks', () => {
  it('enables both buttons when both links exist, keeping each glyph', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' });

    expect(controls.magnet.getAttribute('href')).toBe('magnet:?xt=urn:btih:abc');
    expect(controls.magnet.hasAttribute('aria-disabled')).toBe(false);
    expect(glyphOf(controls.magnet)).toBe('magnet');
    expect(ariaLabel(controls.magnet)).toBe('Magnet');
    expect(controls.magnet.hasAttribute('data-state')).toBe(false);
    expect(controls.torrent.disabled).toBe(false);
    expect(glyphOf(controls.torrent)).toBe('file');
    expect(ariaLabel(controls.torrent)).toBe('Save .torrent file');
    expect(controls.torrent.hasAttribute('data-state')).toBe(false);
  });

  it('disables only the .torrent button when its file is missing, naming the reason', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: null });

    // The magnet stays a live link...
    expect(controls.magnet.getAttribute('href')).toBe('magnet:?xt=urn:btih:abc');
    expect(controls.magnet.hasAttribute('aria-disabled')).toBe(false);
    expect(glyphOf(controls.magnet)).toBe('magnet');
    // ...and only its own button is marked missing, showing the slashed file variant.
    expect(controls.torrent.disabled).toBe(true);
    expect(glyphOf(controls.torrent)).toBe('file-missing');
    expect(controls.torrent.getAttribute('data-state')).toBe('missing');
    expect(controls.torrent.title).toBe('no .torrent');
    expect(controls.torrent.hasAttribute('title')).toBe(true);
  });

  it('disables only the magnet button when its link is missing, naming the reason', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setLinks({ magnet: null, torrentUrl: 'https://x/a.torrent' });

    expect(controls.magnet.hasAttribute('href')).toBe(false);
    expect(controls.magnet.getAttribute('aria-disabled')).toBe('true');
    expect(glyphOf(controls.magnet)).toBe('magnet-missing');
    expect(controls.magnet.getAttribute('data-state')).toBe('missing');
    expect(controls.magnet.title).toBe('no magnet');
    expect(controls.torrent.disabled).toBe(false);
    expect(glyphOf(controls.torrent)).toBe('file');
  });

  it('marks both buttons missing when the page resolved to neither link', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setLinks({ magnet: null, torrentUrl: null });

    expect(controls.magnet.getAttribute('data-state')).toBe('missing');
    expect(glyphOf(controls.magnet)).toBe('magnet-missing');
    expect(controls.magnet.title).toBe('no magnet');
    expect(controls.magnet.hasAttribute('href')).toBe(false);
    expect(controls.magnet.getAttribute('aria-disabled')).toBe('true');
    expect(controls.torrent.getAttribute('data-state')).toBe('missing');
    expect(glyphOf(controls.torrent)).toBe('file-missing');
    expect(controls.torrent.title).toBe('no .torrent');
    expect(controls.torrent.disabled).toBe(true);
  });

  it('clears a stale failure tooltip when a row resolves', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setFailed('boom');
    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' });

    expect(controls.magnet.hasAttribute('title')).toBe(false);
    expect(controls.torrent.hasAttribute('title')).toBe(false);
    expect(controls.torrent.hasAttribute('data-state')).toBe(false);
  });
});

describe('RowControls save lifecycle', () => {
  it('shows the in-flight glyph and a saving marker on the .torrent button', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setSaving();

    expect(glyphOf(controls.torrent)).toBe('file-saving');
    // The one layer the stylesheet turns, carrying its own class rather than relying on paint order.
    expect(spinLayers(controls.torrent)).toHaveLength(2);
    expect(controls.torrent.getAttribute('data-state')).toBe('saving');
    expect(ariaLabel(controls.torrent)).toBe('saving…');
    expect(controls.torrent.title).toBe('saving…');
    expect(controls.torrent.disabled).toBe(true);
  });

  it('shows a check glyph and a saved marker on the .torrent button', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setSaved();

    expect(glyphOf(controls.torrent)).toBe('check');
    expect(controls.torrent.getAttribute('data-state')).toBe('saved');
    expect(ariaLabel(controls.torrent)).toBe('saved');
    expect(controls.torrent.disabled).toBe(true);
    expect(controls.torrent.hasAttribute('title')).toBe(false);
  });

  it('leaves the magnet button untouched and usable while the download is saving…', () => {
    const controls = singleControls(NAME_CELL_ROW(''));
    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' });

    controls.setSaving();

    // The save lifecycle touches only the .torrent button; the magnet stays live throughout.
    expect(controls.magnet.hasAttribute('aria-disabled')).toBe(false);
    expect(glyphOf(controls.magnet)).toBe('magnet');
    expect(ariaLabel(controls.magnet)).toBe('Magnet');
  });

  it('leaves the magnet button untouched and usable after the download saved', () => {
    const controls = singleControls(NAME_CELL_ROW(''));
    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' });

    controls.setSaved();

    expect(controls.magnet.hasAttribute('aria-disabled')).toBe(false);
    expect(glyphOf(controls.magnet)).toBe('magnet');
  });

  it('shows an alert glyph and the reason as tooltip and name when the download fails', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setFailed('download blocked');

    expect(glyphOf(controls.torrent)).toBe('alert');
    expect(controls.torrent.getAttribute('data-state')).toBe('failed');
    expect(ariaLabel(controls.torrent)).toBe('download blocked');
    expect(controls.torrent.title).toBe('download blocked');
    expect(controls.torrent.disabled).toBe(true);
  });

  it('falls back to a non-empty name and tooltip when the failure reason is empty', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setFailed('');

    expect(glyphOf(controls.torrent)).toBe('alert');
    expect(controls.torrent.getAttribute('data-state')).toBe('failed');
    expect(ariaLabel(controls.torrent)).toBe('download failed');
    expect(controls.torrent.title).toBe('download failed');
  });

  it('treats a whitespace-only failure reason as absent', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setFailed('   ');

    expect(ariaLabel(controls.torrent)).toBe('download failed');
    expect(controls.torrent.title).toBe('download failed');
  });

  it('passes a non-empty failure reason through unchanged', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setFailed(' download blocked ');

    expect(ariaLabel(controls.torrent)).toBe(' download blocked ');
    expect(controls.torrent.title).toBe(' download blocked ');
  });

  it('leaves the magnet button usable when only the download failed', () => {
    const controls = singleControls(NAME_CELL_ROW(''));
    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' });

    controls.setFailed('download blocked');

    expect(controls.magnet.hasAttribute('aria-disabled')).toBe(false);
    expect(glyphOf(controls.magnet)).toBe('magnet');
    expect(controls.magnet.hasAttribute('title')).toBe(false);
  });
});

describe('RowControls.setUnresolved', () => {
  it('marks both buttons failed, so a dead row cannot look like it is loading', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setUnresolved('HTTP 403');

    for (const control of [controls.magnet, controls.torrent]) {
      expect(glyphOf(control)).toBe('alert');
      expect(control.getAttribute('data-state')).toBe('failed');
      expect(ariaLabel(control)).toBe('HTTP 403');
      expect(control.title).toBe('HTTP 403');
    }
    // Both are unavailable, and the magnet carries no link, so none is offered to copy (D-013).
    expect(controls.magnet.hasAttribute('href')).toBe(false);
    expect(controls.magnet.getAttribute('aria-disabled')).toBe('true');
    expect(controls.torrent.disabled).toBe(true);
  });

  it('falls back to a non-empty name and tooltip when the unresolved reason is empty', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setUnresolved('');

    for (const control of [controls.magnet, controls.torrent]) {
      expect(glyphOf(control)).toBe('alert');
      expect(control.getAttribute('data-state')).toBe('failed');
      expect(ariaLabel(control)).toBe('could not load details');
      expect(control.title).toBe('could not load details');
    }
    expect(controls.magnet.hasAttribute('href')).toBe(false);
    expect(controls.magnet.getAttribute('aria-disabled')).toBe('true');
    expect(controls.torrent.disabled).toBe(true);
  });

  it('treats a whitespace-only unresolved reason as absent', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setUnresolved('\n\t ');

    expect(ariaLabel(controls.magnet)).toBe('could not load details');
    expect(ariaLabel(controls.torrent)).toBe('could not load details');
    expect(controls.magnet.title).toBe('could not load details');
    expect(controls.torrent.title).toBe('could not load details');
  });

  it('passes a non-empty unresolved reason through unchanged', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setUnresolved('HTTP 403');

    expect(ariaLabel(controls.magnet)).toBe('HTTP 403');
    expect(ariaLabel(controls.torrent)).toBe('HTTP 403');
  });

  it('clears both failure tooltips when the row later resolves', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setUnresolved('boom');
    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' });

    expect(controls.magnet.hasAttribute('title')).toBe(false);
    expect(controls.torrent.hasAttribute('title')).toBe(false);
  });
});

describe('RowControls magnet link (D-013)', () => {
  it('carries the resolved magnet verbatim on an anchor', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc&dn=Name', torrentUrl: null });

    // A real link, whose href is the URI exactly as the detail page wrote it — never normalised.
    expect(controls.magnet.tagName).toBe('A');
    expect(controls.magnet.getAttribute('href')).toBe('magnet:?xt=urn:btih:abc&dn=Name');
    expect(controls.magnet.hasAttribute('aria-disabled')).toBe(false);
    expect(ariaLabel(controls.magnet)).toBe('Magnet');
    expect(controls.magnet.hasAttribute('title')).toBe(false);
    expect(glyphOf(controls.magnet)).toBe('magnet');
  });

  it('writes the magnet to the attribute without encoding or trimming', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setLinks({
      magnet: ' magnet:?xt=urn:btih:abc&dn=Name With Space ',
      torrentUrl: null,
    });

    // Pins the write path against a "sanitise the magnet" regression: the internal raw space must
    // not be percent-encoded and the leading/trailing spaces must not be trimmed (a transformation
    // would change the value). The setAttribute-vs-property choice behind D-013 is a real-browser
    // behaviour this DOM shim cannot observe, so that distinction is not what this test guarantees.
    expect(controls.magnet.getAttribute('href')).toBe(
      ' magnet:?xt=urn:btih:abc&dn=Name With Space ',
    );
  });

  it('is not a link while there is nothing to carry', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    // Injected and unresolved: still the magnet glyph and name, but no href to copy.
    expect(controls.magnet.tagName).toBe('A');
    expect(controls.magnet.hasAttribute('href')).toBe(false);
    expect(controls.magnet.getAttribute('aria-disabled')).toBe('true');
    expect(glyphOf(controls.magnet)).toBe('magnet');
    expect(ariaLabel(controls.magnet)).toBe('Magnet');

    // Resolved, but the page carries no magnet: the slashed variant names the reason, still no link.
    controls.setLinks({ magnet: null, torrentUrl: 'https://x/a.torrent' });
    expect(controls.magnet.hasAttribute('href')).toBe(false);
    expect(controls.magnet.getAttribute('aria-disabled')).toBe('true');
    expect(glyphOf(controls.magnet)).toBe('magnet-missing');
    expect(controls.magnet.getAttribute('data-state')).toBe('missing');
    expect(controls.magnet.title).toBe('no magnet');

    // A row whose detail page could not be read at all: the reason, and still no link.
    controls.setUnresolved('HTTP 403');
    expect(controls.magnet.hasAttribute('href')).toBe(false);
    expect(controls.magnet.getAttribute('aria-disabled')).toBe('true');
    expect(glyphOf(controls.magnet)).toBe('alert');
    expect(ariaLabel(controls.magnet)).toBe('HTTP 403');
    expect(controls.magnet.title).toBe('HTTP 403');
  });

  it('clears the href when a resolved magnet later goes missing', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: null });
    expect(controls.magnet.getAttribute('href')).toBe('magnet:?xt=urn:btih:abc');

    // The one render path is defensive: a state with no magnet must not leave the stale link behind.
    controls.setLinks({ magnet: null, torrentUrl: null });
    expect(controls.magnet.hasAttribute('href')).toBe(false);
    expect(controls.magnet.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('control glyphs', () => {
  it('draws the glyph the state calls for, through every transition', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    // Injected, unresolved: the magnet and file base pictograms.
    expect(glyphOf(controls.magnet)).toBe('magnet');
    expect(glyphOf(controls.torrent)).toBe('file');

    // Resolved: the same pictograms, now live.
    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' });
    expect(glyphOf(controls.magnet)).toBe('magnet');
    expect(glyphOf(controls.torrent)).toBe('file');

    // Missing: each base pictogram's greyed, slashed variant.
    controls.setLinks({ magnet: null, torrentUrl: null });
    expect(glyphOf(controls.magnet)).toBe('magnet-missing');
    expect(glyphOf(controls.torrent)).toBe('file-missing');

    // Saving: a pictogram of its own, because the available one said nothing was happening.
    controls.setSaving();
    expect(glyphOf(controls.torrent)).toBe('file-saving');

    // Saved: a check.
    controls.setSaved();
    expect(glyphOf(controls.torrent)).toBe('check');

    // Failed: an alert.
    controls.setFailed('download blocked');
    expect(glyphOf(controls.torrent)).toBe('alert');

    // Unresolved: an alert on both, so a dead row never looks like it is still loading.
    controls.setUnresolved('HTTP 403');
    expect(glyphOf(controls.magnet)).toBe('alert');
    expect(glyphOf(controls.torrent)).toBe('alert');
  });

  it('draws saving as a pictogram of its own, so it cannot pass for the available control', () => {
    const controls = singleControls(NAME_CELL_ROW(''));
    controls.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' });
    const availableGlyph = glyphOf(controls.torrent);
    const availableState = controls.torrent.getAttribute('data-state');

    controls.setSaving();
    const savingGlyph = glyphOf(controls.torrent);

    // Clicking the control must change what is on screen, not only the words nobody sees while
    // clicking: `saving` is a different drawing from the live `.torrent` glyph (D-009).
    expect(availableGlyph).toBe('file');
    expect(savingGlyph).toBe('file-saving');
    expect(savingGlyph).not.toBe(availableGlyph);
    expect(availableState).toBeNull();
    expect(controls.torrent.getAttribute('data-state')).toBe('saving');

    // Motion is the extra signal, never the only one: with the animation off the arc below still
    // differs from the arrow it replaced. The state stays a disabled, named control (D-007/D-008).
    expect(spinLayers(controls.torrent)).toHaveLength(2);
    expect(controls.torrent.disabled).toBe(true);
    expect(ariaLabel(controls.torrent)).toBe('saving…');
  });

  it('keeps missing and failed distinguishable by both glyph and marker', () => {
    const controls = singleControls(NAME_CELL_ROW(''));

    controls.setLinks({ magnet: null, torrentUrl: null });
    const missingGlyph = glyphOf(controls.torrent);
    const missingState = controls.torrent.getAttribute('data-state');

    controls.setFailed('');
    const failedGlyph = glyphOf(controls.torrent);
    const failedState = controls.torrent.getAttribute('data-state');

    // `missing` is the file pictogram, greyed and slashed; `failed` is the alert. They must not be
    // the same drawing, or a row with no `.torrent` would read as a failed download.
    expect(missingGlyph).toBe('file-missing');
    expect(failedGlyph).toBe('alert');
    expect(missingGlyph).not.toBe(failedGlyph);
    expect(missingState).toBe('missing');
    expect(failedState).toBe('failed');
    expect(missingState).not.toBe(failedState);
  });

  it('never renders an empty accessible name, whatever the state and reason', () => {
    const scenarios: ((controls: RowControls) => void)[] = [
      // Injected and untouched.
      () => undefined,
      // Resolved, partly resolved and fully missing.
      (c) => c.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: 'https://x/a.torrent' }),
      (c) => c.setLinks({ magnet: null, torrentUrl: 'https://x/a.torrent' }),
      (c) => c.setLinks({ magnet: 'magnet:?xt=urn:btih:abc', torrentUrl: null }),
      (c) => c.setLinks({ magnet: null, torrentUrl: null }),
      // The save lifecycle, including the empty and whitespace-only reasons D-008 guards.
      (c) => c.setSaving(),
      (c) => c.setSaved(),
      (c) => c.setFailed(''),
      (c) => c.setFailed('   '),
      (c) => c.setFailed('download blocked'),
      // The whole-row failure, again with a reason that must be replaced rather than rendered.
      (c) => c.setUnresolved(''),
      (c) => c.setUnresolved(' '),
      (c) => c.setUnresolved('HTTP 403'),
    ];

    for (const scenario of scenarios) {
      const controls = singleControls(NAME_CELL_ROW(''));
      scenario(controls);

      for (const button of [controls.magnet, controls.torrent]) {
        const name = ariaLabel(button);
        expect(name).not.toBeNull();
        expect((name ?? '').trim()).not.toBe('');
      }
    }
  });
});
