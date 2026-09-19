/**
 * The inline SVG glyphs the controls draw (D-003). Every one is authored here as filled, two-tone
 * pictograms on a 24×24 viewBox whose artwork fills roughly 18–20 units, so a glyph stays chunky and
 * readable at the 14–16 px the controls are sized to. Each shape is painted with a dark outline
 * underneath its fills, which is what keeps a saturated battery of shapes legible on a light page
 * and a dark one. They are built with `createElementNS` — which happy-dom supports as well as a
 * browser — and each `<svg>` carries a stable `data-icon` marker so a test can assert which glyph is
 * rendered without depending on the path data. Only `file-saving` differs from a still pictogram: it
 * carries one shape the stylesheet spins, so work in progress is visible (D-009).
 */
export type IconName =
  'magnet' | 'magnet-missing' | 'file' | 'file-saving' | 'file-missing' | 'check' | 'alert';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The class the stylesheet sizes glyphs by; scoped to the extension's own prefix (D-003). */
const ICON_CLASS = 'x-1337x-auto-links-icon';

/**
 * The class the stylesheet spins while a save is in flight (D-009). It is stamped on the single
 * shape that moves, so the animation never has to know a glyph's paint order.
 */
export const SAVING_SPIN_CLASS = 'x-1337x-auto-links-saving-spin';

/** One filled pictogram layer: a `filled` shape, or a `none`-filled stroke for detail on top. */
interface GlyphShape {
  d: string;
  fill: string;
  stroke?: string;
  width?: number;
  /** A class to stamp on this layer alone, for a stylesheet that has to target just it. */
  className?: string;
}

// The outline and the distinct fills the glyphs are drawn from. The dark outline is shared by every
// glyph so a shape reads the same on a light page and a dark one; the fills carry the meaning.
const OUTLINE = '#171a1f';
const WHITE = '#ffffff';
const MAGNET_BODY = '#e02b2b';
const MAGNET_TIP = '#e9edf2';
const DOWNLOAD_ARROW = '#2f6bff';
// The tray is the lighter of the two blues: a dark tray disappears into a dark page, while a light
// one holds its shape against both backgrounds behind the shared dark outline.
const DOWNLOAD_TRAY = '#8fb4ff';
const CHECK_DISC = '#1f9d55';
const ALERT_BODY = '#ea9d2e';
const MISSING_BODY = '#98a0ac';
const MISSING_ACCENT = '#c6ccd5';
const SLASH = '#333a45';

const OUTLINE_WIDTH = 1.3;
/** The seam between a horseshoe magnet's body and its pole tips is drawn thinner than the outline. */
const SEAM_WIDTH = 1.1;

/** A closed circle as one path, so every layer is a `<path>` and no element type varies. */
function disc(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

// The shared geometry. The magnet and download base shapes are reused verbatim by their `missing`
// variants, which only swap the palette and add the slash — so a grey magnet is unmistakably the
// magnet and not a new pictogram.
const MAGNET_SILHOUETTE =
  'M4.5 20.5 V10.5 A7.5 7.5 0 0 1 19.5 10.5 V20.5 H15.5 V10.5 A3.5 3.5 0 0 0 8.5 10.5 V20.5 Z';
const MAGNET_TIP_LEFT = 'M4.5 16.5 H8.5 V20.5 H4.5 Z';
const MAGNET_TIP_RIGHT = 'M15.5 16.5 H19.5 V20.5 H15.5 Z';
const TRAY_PATH =
  'M4 15 H6.6 V18.6 H17.4 V15 H20 V18.8 A1.9 1.9 0 0 1 18.1 20.7 H5.9 A1.9 1.9 0 0 1 4 18.8 Z';
const ARROW_PATH = 'M10.4 3 H13.6 V9 H17.4 L12 14.8 L6.6 9 H10.4 Z';
const CHECK_TICK = 'M7.6 12.4 L10.7 15.5 L16.5 8.9';
const ALERT_TRIANGLE = 'M12 3.6 L21.6 20.4 H2.4 Z';
const ALERT_BAR = 'M12 9.4 V13.8';
const SLASH_D = 'M4.6 19.4 L19.4 4.6';

/**
 * The three-quarter arc that replaces the download arrow while a save is in flight (D-009). It runs
 * clockwise from the top of its circle to its left edge, closing 270° of a 4.7-radius circle centred
 * at (12, 7.9) — the slot the arrow occupied, so the tray below keeps the control's identity. The
 * arc is stroked a little heavier than the arrow's outline so it still reads as an open ring, not a
 * smudge, at the 14 px the controls are used at. Spanning the top, right, bottom and left of that
 * circle leaves its bounding box concentric with it, which is what lets the stylesheet spin it in
 * place with `transform-box: fill-box` alone.
 */
const SAVING_ARC = 'M12 3.2 A4.7 4.7 0 1 1 7.3 7.9';

const MAGNET_SHAPES: GlyphShape[] = [
  { d: MAGNET_SILHOUETTE, fill: MAGNET_BODY, stroke: OUTLINE, width: OUTLINE_WIDTH },
  { d: MAGNET_TIP_LEFT, fill: MAGNET_TIP, stroke: OUTLINE, width: SEAM_WIDTH },
  { d: MAGNET_TIP_RIGHT, fill: MAGNET_TIP, stroke: OUTLINE, width: SEAM_WIDTH },
];

const DOWNLOAD_SHAPES: GlyphShape[] = [
  { d: TRAY_PATH, fill: DOWNLOAD_TRAY, stroke: OUTLINE, width: OUTLINE_WIDTH },
  { d: ARROW_PATH, fill: DOWNLOAD_ARROW, stroke: OUTLINE, width: OUTLINE_WIDTH },
];

/**
 * The slash that marks a `missing` control, drawn twice: a white halo knocks the glyph out behind
 * it, then the grey blade sits on top. The halo is what makes the slash read over any fill, on
 * either background.
 */
function slashShapes(): GlyphShape[] {
  return [
    { d: SLASH_D, fill: 'none', stroke: WHITE, width: 4.8 },
    { d: SLASH_D, fill: 'none', stroke: SLASH, width: 2.4 },
  ];
}

const GLYPHS: Record<IconName, GlyphShape[]> = {
  magnet: MAGNET_SHAPES,
  'magnet-missing': [
    { d: MAGNET_SILHOUETTE, fill: MISSING_BODY, stroke: OUTLINE, width: OUTLINE_WIDTH },
    { d: MAGNET_TIP_LEFT, fill: MISSING_ACCENT, stroke: OUTLINE, width: SEAM_WIDTH },
    { d: MAGNET_TIP_RIGHT, fill: MISSING_ACCENT, stroke: OUTLINE, width: SEAM_WIDTH },
    ...slashShapes(),
  ],
  file: DOWNLOAD_SHAPES,
  'file-saving': [
    { d: TRAY_PATH, fill: DOWNLOAD_TRAY, stroke: OUTLINE, width: OUTLINE_WIDTH },
    {
      d: SAVING_ARC,
      fill: 'none',
      stroke: OUTLINE,
      width: 4.4,
      className: SAVING_SPIN_CLASS,
    },
    {
      d: SAVING_ARC,
      fill: 'none',
      stroke: DOWNLOAD_ARROW,
      width: 3.2,
      className: SAVING_SPIN_CLASS,
    },
  ],
  'file-missing': [
    { d: TRAY_PATH, fill: MISSING_ACCENT, stroke: OUTLINE, width: OUTLINE_WIDTH },
    { d: ARROW_PATH, fill: MISSING_BODY, stroke: OUTLINE, width: OUTLINE_WIDTH },
    ...slashShapes(),
  ],
  check: [
    { d: disc(12, 12, 9), fill: CHECK_DISC, stroke: OUTLINE, width: OUTLINE_WIDTH },
    { d: CHECK_TICK, fill: 'none', stroke: WHITE, width: 2.6 },
  ],
  alert: [
    { d: ALERT_TRIANGLE, fill: ALERT_BODY, stroke: OUTLINE, width: OUTLINE_WIDTH },
    { d: ALERT_BAR, fill: 'none', stroke: WHITE, width: 2.6 },
    { d: disc(12, 17.1, 1.6), fill: WHITE },
  ],
};

/** Builds one glyph as an `<svg>` in `doc`, marked with `data-icon` so it can be identified. */
export function createIcon(doc: Document, name: IconName): SVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('data-icon', name);
  svg.setAttribute('class', ICON_CLASS);
  // The glyph is decorative: the button it sits on carries the accessible name.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const shape of GLYPHS[name]) svg.append(createShape(doc, shape));

  return svg;
}

function createShape(doc: Document, shape: GlyphShape): SVGPathElement {
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', shape.d);
  path.setAttribute('fill', shape.fill);

  if (shape.className !== undefined) path.setAttribute('class', shape.className);

  if (shape.stroke !== undefined) {
    path.setAttribute('stroke', shape.stroke);
    path.setAttribute('stroke-width', String(shape.width ?? OUTLINE_WIDTH));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  }

  return path;
}
