// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SAVING_SPIN_CLASS } from '../../src/core/icons';

// The stylesheet ships unmodified, so it is read as text and inspected as text — the same way
// `icons.test.ts` reads the committed icons, and the only way to assert on rules a browser, not a
// DOM shim, is what applies.
const contentCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'content', 'content.css'),
  'utf8',
);

const SAVING_CONTROL = ".x-1337x-auto-links-torrent[data-state='saving']";
const SAVING_SPIN = `${SAVING_CONTROL} .${SAVING_SPIN_CLASS}`;
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

/**
 * The text inside the first `{…}` at or after `from`, with nested braces matched. A missing or
 * unbalanced block throws rather than silently returning an empty body, so a rule that was deleted
 * fails the suite instead of passing as "contains nothing".
 */
function blockAfter(from: number): string {
  const open = contentCss.indexOf('{', from);
  if (open === -1) throw new Error('no block opening brace after the given prelude');

  let depth = 0;
  for (let i = open; i < contentCss.length; i += 1) {
    const char = contentCss[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return contentCss.slice(open + 1, i);
    }
  }

  throw new Error('unbalanced block');
}

/** The declarations of the first rule whose selector is `selector`. */
function ruleBody(selector: string): string {
  const at = contentCss.indexOf(selector);
  if (at === -1) throw new Error(`no rule for ${selector}`);

  return blockAfter(at);
}

/** The body of the first `@media` block whose query is `query`. */
function mediaBody(query: string): string {
  const at = contentCss.indexOf(query);
  if (at === -1) throw new Error(`no media block for ${query}`);

  return blockAfter(at);
}

describe('the saving stylesheet', () => {
  it('animates the in-flight arc under the saving marker alone', () => {
    const body = ruleBody(SAVING_SPIN);

    // A rotation of the arc is the whole point of the state (D-009)...
    expect(body).toMatch(/animation:\s*[\w-]+/);
    // ...and `fill-box` is what keeps it spinning about the arc's own centre rather than the
    // viewBox origin, which would swing it around the glyph instead.
    expect(body).toContain('transform-box: fill-box');

    // The motion hangs off the `saving` marker, never off the control in general: a `.torrent`
    // button that is merely available must not spin.
    expect(() => ruleBody(`.x-1337x-auto-links-torrent .${SAVING_SPIN_CLASS}`)).toThrow();
  });

  it('defines the keyframes that rule names, as a full turn', () => {
    const animation = /animation:\s*([\w-]+)/.exec(ruleBody(SAVING_SPIN));
    expect(animation).not.toBeNull();
    const name = animation?.[1] ?? '';

    const keyframesAt = contentCss.indexOf(`@keyframes ${name}`);
    expect(keyframesAt).toBeGreaterThan(-1);
    expect(blockAfter(keyframesAt)).toContain('rotate(360deg)');
  });

  it('switches the motion off under prefers-reduced-motion, leaving the still glyph', () => {
    const body = mediaBody(REDUCED_MOTION);

    expect(body).toContain(SAVING_SPIN);
    expect(body).toMatch(/animation:\s*none/);
  });
});
