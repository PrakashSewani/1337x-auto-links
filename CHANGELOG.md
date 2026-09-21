# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-21

### Added

- The magnet control on a resolved row is a real `magnet:` link, so the browser's own right-click
  **Copy link address** works on it — the same as on a torrent site — and the link can be dragged to a
  torrent client. A row with nothing to carry (unresolved, magnet-less or failed) is deliberately not
  a link, and the change adds no permission (`docs/decisions.md`, D-013).

## [0.1.0] - 2026-09-20

### Added

- Project scaffold: a Manifest V3 extension written in TypeScript and bundled with esbuild, one
  `npm run check` command (typecheck, lint, Prettier, tests, build), a Vitest suite running against
  HTML fixtures, a CI workflow, and a tag-driven release workflow that attaches the extension zip to
  a GitHub release. The stack and its exact versions are recorded in `docs/decisions.md` (D-001).
- Result rows gain a `Magnet` button and a `.torrent` button, placed inside the row's name cell
  (`docs/decisions.md`, D-003). Each row's links are resolved by a bounded background prefetch of its
  detail page — at most 2 in flight, 300 ms apart, cached by torrent id — after which the magnet is
  handed to the OS torrent client from the page, and the `.torrent` file is saved through the
  browser's download manager from the service worker (D-004). Failures are shown on the affected
  button, and a failed fetch is never cached.
- The controls are icon-only two-tone pictograms — a magnet and a download glyph inline after the
  title, each with an accessible name and tooltip, with distinct glyphs for saving, saved, failed and
  missing and visible feedback while a download is in flight (D-007, D-009).
- Hovering a result row promotes its fetch to the front of the prefetch queue, so the torrent you are
  pointing at resolves first (D-006).
- The extension is named **Magnetline** (D-005) and ships a proper 16/32/48/128 icon set.
- The release zip carries the built extension at its root with an install `README.md` and the MIT
  `LICENSE` beside it, so unzipping is met with the steps rather than a folder of JavaScript (D-011).

### Fixed

- A detail fetch that never settled could hold one of the two prefetch slots for the rest of the page
  load, stalling every row behind it. Every fetch now has a 15-second deadline and fails visibly on
  the row instead (D-010).
- A resolved row's cache write no longer occupies a prefetch slot, and the service worker serialises
  `cache/write` so two concurrent messages cannot interleave a read-modify-write and lose an entry
  (D-010).
- A single cache-read failure used to turn every row into a fresh fetch; it is retried once before
  that fallback (D-010).
