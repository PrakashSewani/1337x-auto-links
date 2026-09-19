const MAX_BASE_LENGTH = 100;

/**
 * Whether a character has no place in a download name. Control characters are U+0000–U+001F and
 * U+007F; path separators are `/` and `\`. Written as a predicate rather than a regex character
 * class so the source contains no literal control characters.
 */
function isUnsafe(codePoint: number, character: string): boolean {
  return codePoint <= 0x1f || codePoint === 0x7f || character === '/' || character === '\\';
}

/** Replaces every unsafe character with a space, so the whitespace collapse below folds the runs. */
function stripUnsafe(value: string): string {
  let safe = '';
  for (const character of value) {
    safe += isUnsafe(character.codePointAt(0) ?? 0, character) ? ' ' : character;
  }
  return safe;
}

/**
 * Turns a row's title into a safe `.torrent` download name: control characters and path separators
 * are stripped, whitespace collapses, the length is capped, and a title with nothing usable left in
 * it falls back to the torrent id. The result always ends in `.torrent`.
 */
export function torrentFilename(title: string, id: string): string {
  const cleaned = stripUnsafe(title).replace(/\s+/g, ' ').trim().slice(0, MAX_BASE_LENGTH).trim();

  return `${cleaned === '' ? id : cleaned}.torrent`;
}
