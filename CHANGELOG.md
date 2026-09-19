# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
