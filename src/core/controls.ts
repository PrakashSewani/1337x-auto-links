import type { DetailLinks } from './detail';
import { createIcon } from './icons';
import type { IconName } from './icons';
import type { ResultRow } from './types';

/**
 * The live controls for one result row (D-003): the container's two controls — the magnet link and
 * the `.torrent` button — plus the setters that render the row's state. `setLinks` is the resolved
 * state; `setSaving` / `setSaved` / `setFailed` are the `.torrent` save lifecycle; `setUnresolved`
 * is a row whose detail page could not be read at all, so neither link is known. The magnet is an
 * anchor so a resolved row is a real link the browser's own right-click copy and drag can act on
 * (D-013).
 */
export interface RowControls {
  row: ResultRow;
  magnet: HTMLAnchorElement;
  torrent: HTMLButtonElement;
  setLinks(links: DetailLinks): void;
  setSaving(): void;
  setSaved(): void;
  setFailed(message: string): void;
  setUnresolved(message: string): void;
}

/** Marks a row the extension has already handled, so a second run does not duplicate the controls. */
const INJECTED_ATTRIBUTE = 'data-1337x-auto-links';

const CONTROLS_CLASS = 'x-1337x-auto-links-controls';
const MAGNET_CLASS = 'x-1337x-auto-links-magnet';
const TORRENT_CLASS = 'x-1337x-auto-links-torrent';

/** The `data-state` marker the stylesheet keys the non-default button looks off. */
const DATA_STATE = 'data-state';

/** The controls' accessible names: what each control does, since an icon alone does not say it. */
const MAGNET_LABEL = 'Magnet';
const TORRENT_LABEL = 'Save .torrent file';
const MISSING_MAGNET_TITLE = 'no magnet';
const MISSING_TORRENT_TITLE = 'no .torrent';
const SAVING_LABEL = 'saving…';
const SAVED_LABEL = 'saved';

/**
 * Non-empty reasons for the failure states (D-008). A rejection can carry an empty message, and
 * rendering that verbatim would leave an icon-only control with no accessible name at all — the
 * exact outcome D-007 exists to prevent.
 */
const FAILED_FALLBACK = 'download failed';
const UNRESOLVED_FALLBACK = 'could not load details';

const MISSING_STATE = 'missing';
const SAVING_STATE = 'saving';
const SAVED_STATE = 'saved';
const FAILED_STATE = 'failed';

/** Everything one control renders: its glyph, accessible name, usability and CSS marker. */
interface ControlState {
  icon: IconName;
  /** The accessible name (`aria-label`) and, unless `title` overrides it, the tooltip. */
  label: string;
  enabled: boolean;
  /** The `data-state` marker, or `null` to clear it. */
  state: string | null;
  title?: string;
  /**
   * The magnet URI to carry, verbatim (D-013). Set on the anchor, ignored by the button; `null` or
   * absent clears any previous `href`.
   */
  href?: string | null;
}

interface InjectedButtons {
  magnet: HTMLAnchorElement;
  torrent: HTMLButtonElement;
}

/**
 * Injects the per-row controls (D-003) and returns handles to them. The container goes inside the
 * row's name cell, directly after the title link; a row with no name cell is skipped rather than
 * guessed at. Idempotent — a row that already carries the container reuses it. Both controls start
 * disabled, showing their glyphs; the magnet starts with no `href`.
 */
export function injectControls(rows: ResultRow[]): RowControls[] {
  const controls: RowControls[] = [];

  for (const row of rows) {
    const nameCell = row.nameCell;
    if (nameCell === null) continue;

    const buttons = findInjected(nameCell) ?? insertControls(row, nameCell);
    controls.push(makeControls(row, buttons));
  }

  return controls;
}

function makeControls(row: ResultRow, buttons: InjectedButtons): RowControls {
  return {
    row,
    magnet: buttons.magnet,
    torrent: buttons.torrent,
    setLinks(links) {
      renderLink(
        buttons.magnet,
        links.magnet,
        'magnet',
        'magnet-missing',
        MAGNET_LABEL,
        MISSING_MAGNET_TITLE,
      );
      renderLink(
        buttons.torrent,
        links.torrentUrl,
        'file',
        'file-missing',
        TORRENT_LABEL,
        MISSING_TORRENT_TITLE,
      );
    },
    setSaving() {
      render(buttons.torrent, {
        icon: 'file-saving',
        label: SAVING_LABEL,
        enabled: false,
        state: SAVING_STATE,
        title: SAVING_LABEL,
      });
    },
    setSaved() {
      render(buttons.torrent, {
        icon: 'check',
        label: SAVED_LABEL,
        enabled: false,
        state: SAVED_STATE,
      });
    },
    setFailed(message) {
      const reason = reasonOr(message, FAILED_FALLBACK);
      // Only the `.torrent` save failed; the magnet control is left exactly as it was — usable.
      render(buttons.torrent, {
        icon: 'alert',
        label: reason,
        enabled: false,
        state: FAILED_STATE,
        title: reason,
      });
    },
    setUnresolved(message) {
      const reason = reasonOr(message, UNRESOLVED_FALLBACK);
      // Neither link is known, so both controls say so: leaving the magnet as `Magnet` would
      // read as "still loading" forever, and it must drop any href it was carrying (D-013).
      render(buttons.magnet, {
        icon: 'alert',
        label: reason,
        enabled: false,
        state: FAILED_STATE,
        title: reason,
      });
      render(buttons.torrent, {
        icon: 'alert',
        label: reason,
        enabled: false,
        state: FAILED_STATE,
        title: reason,
      });
    },
  };
}

/**
 * Enables a control iff its link resolved. A missing link keeps the same pictogram, swapped for its
 * own greyed, slashed variant and naming the reason, so `missing` is never mistaken for the default
 * or the failed state (D-007). On the magnet anchor the resolved `href` is carried verbatim, and
 * cleared in every other state, through this one path (D-013).
 */
function renderLink(
  element: HTMLAnchorElement | HTMLButtonElement,
  href: string | null,
  icon: IconName,
  missingIcon: IconName,
  label: string,
  missingTitle: string,
): void {
  if (href === null) {
    render(element, {
      icon: missingIcon,
      label,
      enabled: false,
      state: MISSING_STATE,
      title: missingTitle,
    });
    return;
  }

  render(element, { icon, label, enabled: true, state: null, href });
}

/** A reason the control can actually render: an empty or whitespace-only message is absent. */
function reasonOr(message: string, fallback: string): string {
  return message.trim() === '' ? fallback : message;
}

/**
 * Renders one control: swaps in its glyph, sets the accessible name, drives `disabled` on the
 * button, stamps the `data-state` marker, and sets or clears the tooltip so a stale one never
 * lingers. The magnet anchor's `href` and `aria-disabled` are written here too, from the single
 * path every state goes through, so `href` is present exactly when there is a magnet to carry and no
 * state can leave one behind (D-013).
 */
function render(element: HTMLAnchorElement | HTMLButtonElement, state: ControlState): void {
  element.replaceChildren(createIcon(element.ownerDocument, state.icon));
  element.setAttribute('aria-label', state.label);

  if (element instanceof HTMLAnchorElement) {
    // `setAttribute` keeps the URI exactly as the detail page wrote it: a property assignment could
    // normalise it. With no magnet there is no link at all, so the anchor reads as disabled.
    if (state.href == null) {
      element.removeAttribute('href');
      element.setAttribute('aria-disabled', 'true');
    } else {
      element.setAttribute('href', state.href);
      element.removeAttribute('aria-disabled');
    }
  } else {
    element.disabled = !state.enabled;
  }

  if (state.state === null) element.removeAttribute(DATA_STATE);
  else element.setAttribute(DATA_STATE, state.state);

  if (state.title === undefined) element.removeAttribute('title');
  else element.title = state.title;
}

function findInjected(nameCell: HTMLTableCellElement): InjectedButtons | null {
  const container = nameCell.querySelector<HTMLElement>(`.${CONTROLS_CLASS}`);
  if (container === null) return null;

  const magnet = container.querySelector<HTMLAnchorElement>(`.${MAGNET_CLASS}`);
  const torrent = container.querySelector<HTMLButtonElement>(`.${TORRENT_CLASS}`);
  if (magnet === null || torrent === null) return null;

  return { magnet, torrent };
}

function insertControls(row: ResultRow, nameCell: HTMLTableCellElement): InjectedButtons {
  const doc = nameCell.ownerDocument;

  const container = doc.createElement('span');
  container.className = CONTROLS_CLASS;

  const magnet = createAnchor(doc, 'magnet', MAGNET_LABEL, MAGNET_CLASS);
  const torrent = createButton(doc, 'file', TORRENT_LABEL, TORRENT_CLASS);
  container.append(magnet, torrent);

  row.row.setAttribute(INJECTED_ATTRIBUTE, '');
  nameCell.insertBefore(container, row.link.nextSibling);

  return { magnet, torrent };
}

/** The magnet is an anchor (D-013) so a resolved row is a real link; it carries no `type`. */
function createAnchor(
  doc: Document,
  icon: IconName,
  label: string,
  className: string,
): HTMLAnchorElement {
  const anchor = doc.createElement('a');
  anchor.className = className;
  render(anchor, { icon, label, enabled: false, state: null });

  return anchor;
}

function createButton(
  doc: Document,
  icon: IconName,
  label: string,
  className: string,
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = className;
  render(button, { icon, label, enabled: false, state: null });

  return button;
}
