/**
 * The extension's logger. A single switch — `DEBUG` — turns every message off; there are no levels
 * and no dependencies. Messages are prefixed so they can be filtered in a console.
 *
 * Where they land: the content script logs to the page's own console, the service worker logs to
 * the extension's service-worker console (`chrome://extensions` → the extension → "service worker").
 */
const PREFIX = '[1337x-auto-links]';

export const DEBUG = true;

export function log(...messages: unknown[]): void {
  if (DEBUG) console.log(PREFIX, ...messages);
}

export function error(...messages: unknown[]): void {
  if (DEBUG) console.error(PREFIX, ...messages);
}
