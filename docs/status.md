# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | **complete** |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | **complete** — independently verified 2026-09-19 |
| 2 | Core behavior: the one workflow the tool exists for, end to end, with tests | **complete** — implemented, independently verified, and the verification's own gaps closed |
| 3 | Polish: README, icons, error messages, docs — the parts users judge first | **in progress** — the product name, the redesigned pictogram controls, hover priority and the extension icon set have landed; the first real-browser acceptance test is all that remains |
| 4 | Release: tag `v0.1.0`, artifacts published, install path verified from a clean machine | not started |

## Current handoff

**Phase:** 3 — everything the user judges first is in place; the workflow itself still has to be
confirmed on a real 1337x page, which no fixture can do.

**Done this session (continued):**

- **D-005** — the product is **Magnetline**. The repository slug, the npm package name and the release
  artifact name are unchanged, so the release procedure needed no edit.
- **D-006** — hovering a result row promotes its pending fetch to the front of the queue. The queue is
  now keyed by torrent id and exposes `prioritize(key)`; promotion changes order only, never the
  2-in-flight cap or the 300 ms spacing, and promoting an in-flight or unknown task is a no-op.
- **D-007** — the controls are icon-only: a magnet glyph and a file glyph inline after the title, each
  with an accessible name and a tooltip, and glyph-based `data-state` markers for `saving`, `saved`,
  `failed` and `missing`.
- **D-009** — the controls are two-tone drawn pictograms (red magnet, blue download tray, green check,
  amber alert, grey slashed variants for the missing links), with the artwork authored in this
  repository — The Pirate Bay's icons were the style reference, never a source. The `saving` state is a
  spinning arc that stays a distinct shape with motion off; a disabled control is never faded into
  invisibility. `release/icons-preview.html` plus a screenshot through the `agent-browser` CLI is now
  this repository's review loop for anything visual — that is how the `saving` state was caught looking
  identical to the idle one.
- **Extension icons** — a generated set (16/32/48/128) from `npm run icons`, copied into `dist/icons/`
  by the build, with the manifest's `icons` map pointing at them.
- **Docs** — `product.md` now names the product and describes the icon controls; `README.md` is
  retitled; `AGENTS.md` records this session's two working preferences; D-005 through D-007 are in
  the decision log; the architecture's controls contract and prefetch invariant match the code;
  `development.md` gained the `npm run icons` row, the corrected troubleshooting rows, and a Logs
  section.

**Verified (observed, not assumed):**

- `npm run check` exits 0 — **102 tests across 10 files**.
- The code is on `main` (commit `5a3f72a`, remote head matches) and **CI ran for real for the first
  time: green on `ubuntu-latest`** — checkout, Node 24, `npm ci`, `npm run check`. The release
  workflow's tag/version guard is still unexercised, because no tag has been pushed: nothing has been
  released or published, which is the intended manual gate.
- The visual states were judged by looking at them, not by reading code: the preview page renders the
  real `createIcon` output with the real stylesheet inlined, so it cannot drift from what ships.
- A stylesheet test asserts what a DOM shim cannot: the `saving` animation hangs off the `saving`
  marker alone (a merely-available control must not spin), the keyframes exist and complete a turn, and
  `prefers-reduced-motion` switches the motion off.
- The icon generator is deterministic: two consecutive runs produced byte-identical files, and all
  four PNGs decode with .NET as 32bpp ARGB at exactly 16/32/48/128. A Vitest suite parses each
  committed file's signature and IHDR, so a future regeneration cannot silently ship a broken icon.
- The zip carries `icons/icon-{16,32,48,128}.png`, `dist/manifest.json` names them, and both JS
  bundles remain self-contained IIFEs with no `import`/`require`.
- This round's behaviour is covered by mutants that fail the suite: promotion not applied, promotion
  of an already-started task, the magnet control clobbered by `setSaving`, and the hover listener
  removed.
- Earlier in the session, an independent verification of phase 2 found no blocking code defects and
  named five surviving mutants; all five were closed with mutant evidence.

**Not verified — browser only, by nature:** the magnet handoff reaching the OS client, the `.torrent`
download saving a valid file, the **live detail-page selectors** (that page has never been captured,
so D-004's tolerance remains a decision rather than a measurement), and how the icons actually look
in a row at the page's font size.

**Next action:** the acceptance test below, in Brave. Then either phase 4 (tag `v0.1.0`) or a
capture-driven selector correction, whichever the test calls for.

### Acceptance test

1. `npm run build`, reload the extension card in `chrome://extensions`, refresh a 1337x page.
2. Each row should show two small icons right after the title. Hover a row deep in the list — its
   icons should enable before the rows above it.
3. Filter the page console by `1337x-auto-links`: rows found, cache hits/misses, each fetch and its
   outcome. The service-worker console (extension card → *service worker*) shows cache and download
   traffic.
4. Click the magnet icon — the torrent client should open with the right torrent and the page must
   stay put. Click the file icon — it should go to `saved` and drop a valid file in Downloads.
5. Report anything else: a control stuck on the alert glyph, or `missing` where the page clearly has
   that link.

**Also open:** `test/icons.test.ts` runs in the Node environment (the only test that reads files —
the rest use `?raw` HTML); `CHANGELOG`'s `[Unreleased]` is finalised at release time; a Chrome Web
Store listing stays a non-goal in `product.md`.
