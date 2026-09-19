# Architecture

A Chromium Manifest V3 extension, written in TypeScript, bundled with esbuild, tested with Vitest.
The stack and its exact versions are recorded in `docs/decisions.md` (D-001).

## Shape

| Artifact | Built by | What it is |
|---|---|---|
| `dist/` | `npm run build` | The unpacked extension: `manifest.json` (version stamped from `package.json`), `content.js`, `content.css`, `background.js`, and `icons/` |
| `release/1337x-auto-links-<version>.zip` | `npm run zip` | The thing users download; contents are `dist/` with the manifest at the zip root |
| `src/` | hand-written | TypeScript sources, grouped by which context they run in |
| `src/icons/` | `npm run icons` | The extension's own icon set (16/32/48/128), generated from code and copied into `dist/icons/` by the build |
| `test/` | hand-written | Vitest suites plus HTML fixtures |

There is no server, no runtime dependency, and nothing to install beyond the zip: the extension is
bundled JavaScript and a manifest.

## Components

| Piece | Where | Responsibility |
|---|---|---|
| Core logic | `src/core/` | Result-row parsing, the control glyphs and their injection (D-003, D-007), magnet/`.torrent` extraction, the keyed prefetch queue with hover promotion (D-006), and the cache. Pure TypeScript — **never imports `chrome.*`**, which is what makes it testable outside a browser. |
| Content script | `src/content/` | Runs on result pages in the page's own origin: finds rows, injects the per-row controls, renders per-row state, prefetches detail pages through the bounded queue, promotes a row on hover, and performs the magnet handoff (see the fetch-ownership rule below). |
| Service worker | `src/background/` | Extension-privileged work the page cannot do: the `chrome.storage` cache and saving a `.torrent` through `chrome.downloads`. The magnet handoff deliberately happens in the page context instead (D-004). |
| Build | `scripts/build.mjs` | Bundles entry points with esbuild, stamps the version into the manifest, writes `dist/`, and zips it to `release/`. |
| CI | `.github/workflows/` | `ci.yml` runs the check command on pushes and pull requests; `release.yml` requires the tag to match the version, then runs the checks and attaches the zip to the GitHub release. |

## Contracts

What users depend on, and what therefore changes only by decision. Where the tool has not caught up
yet, the row says so.

- **The injected controls.** Every result row gains two icon-only controls — a magnet and a
  `.torrent` file — appended inside the row's name cell (`td.coll-1.name`) right after the title and
  wrapped in one container element (D-003, D-007). The table's own columns and row heights are never
  changed. Each control carries an accessible name — the tooltip adds the reason or the in-flight
  state where there is one — and its state is a glyph plus a `data-state` marker (`saving`, `saved`,
  `failed`, `missing`). While a row is unresolved both are
  disabled; once its detail page resolves they enable, and the two are independent — a row can have a
  magnet and no `.torrent` file. The magnet control hands the row's magnet URI to the OS torrent
  client without navigating away. The file control saves the row's `.torrent` through the browser's
  download manager and reports `saved` or `failed` afterwards. A link that cannot be resolved says so
  on that control rather than failing silently.
- **The permissions.** `storage` and `downloads` only. The content script is declared for
  `https://1337x.to/*`; there are no host permissions and no other origins. Any addition to this
  list is a decision, not an edit.
- **Messages** between the content script and the worker — internal to the extension, but both sides
  ship together, so they are versioned with it. Three requests exist — `cache/read`, `cache/write`
  and `torrent/download` — defined once in `src/core/messages.ts`, and a message that is not one of
  them is ignored rather than half-handled.
- **The artifact.** `release/1337x-auto-links-<version>.zip`, where `<version>` is `package.json`'s
  version, stamped into the manifest at build time and matching the `v<version>` tag exactly. The
  release workflow fails when the pushed tag is not exactly `v<version>`, so this is enforced
  mechanically rather than by habit.
- No CLI, no public API, no options page, no configuration file, no telemetry in v1.

## Boundaries and invariants

- **`src/core/` never imports `chrome.*`.** Browser APIs stay in `src/content/` and
  `src/background/`.
- **Fetch ownership:** detail pages are fetched by the content script, in the page's own origin,
  so requests carry the user's session and any Cloudflare clearance. The service worker never
  fetches 1337x pages. (Server-side or extension-origin fetches are answered with a Cloudflare
  challenge — recorded in D-001.)
- **The extension talks to nothing but 1337x.** No analytics, no remote configuration, no
  third-party endpoint, ever.
- **The site's layout is not ours to change.** Injected markup is always a child of an existing
  cell — never a new row, never a new column (D-003). The same rule applies to CSS: every injected
  rule is scoped to the extension's own `x-1337x-auto-links-*` class names, none of them targets
  1337x's markup, and the controls inherit the page's font rather than imposing one. The only
  visible difference to a page should be the controls themselves.
- **Prefetch is bounded:** fetching only happens when a result page is open, at most 2 detail
  fetches are in flight, at least 300 ms separates the starts, nothing is retried, and the queue is
  FIFO **except for explicit promotion** — hovering a row moves its pending fetch to the front
  without ever breaking the cap or the spacing (D-006). Results are cached by torrent id, so a repeat
  search costs no new requests.
- **The cache holds successes only.** A fetch that failed is never written, so a later visit retries
  it; a page that genuinely has no magnet is a result and is cached as one. The cache is pruned to a
  fixed cap rather than growing without bound.
- **Failures are visible.** A row that cannot resolve reports it in the UI; nothing fails silently
  and nothing retries forever.
- **The version is authored in exactly one place** (`package.json`). `src/manifest.json` carries an
  inert placeholder that the build overwrites, so the manifest cannot drift from it.
