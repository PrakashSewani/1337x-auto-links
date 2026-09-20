# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress` — and once every phase is complete, none.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | **complete** |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | **complete** — independently verified 2026-09-19 |
| 2 | Core behavior: the one workflow the tool exists for, end to end, with tests | **complete** — implemented, independently verified, and the verification's own gaps closed |
| 3 | Polish: README, icons, error messages, docs — the parts users judge first | **complete** — the product name, the pictogram controls, hover priority, the icon set, the D-010 loading-path hardening and the D-011 release packaging all landed |
| 4 | Release: tag `v0.1.0`, artifacts published, install path verified from a clean machine | **complete** — `v0.1.0` is tagged and published with the zip attached, and that zip was installed unpacked in Brave (card reading `0.1.0`) with the workflow then confirmed end to end on a real page, 2026-09-20 — on the owner's own machine, which carries this checkout, not on a bare one |

## Current handoff

**Phase:** none — every phase is complete, so the tracker's "exactly one phase `in progress`" rule has
nothing to point at. Phase 4 closed on 2026-09-20: the owner downloaded the zip from the `v0.1.0`
release page, loaded it unpacked in Brave — card reading `0.1.0` — and ran the acceptance test below
against a live page. Nothing is in progress; what is left is listed under **Next action** and
**Also open**.

**Landed on the way to `v0.1.0` (D-005 through D-011):**

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
- **D-010** — the loading path no longer wastes its own budget. Every detail fetch has a 15-second
  deadline and fails visibly (`timed out after 15s`) instead of holding one of the two in-flight
  slots forever; a resolved row's cache write no longer occupies a fetch slot; the worker serialises
  `cache/write`, so two concurrent messages cannot interleave a read-modify-write and lose an entry;
  and a cache-read blip is retried once instead of turning every row into a fetch. The prefetch and
  cache invariants in `docs/architecture.md` were updated to match, and the decision log carries the
  reasoning.
- **D-011** — the release zip now carries the install `README.md` and the MIT `LICENSE` at its root,
  authored in `packaging/README.md` and copied in by the build script, which fails outright if either
  source is missing. The built extension stays at the zip root, so the folder a user unzips is
  exactly the folder they load unpacked. Distribution is still a GitHub release asset and nothing
  else — no store listing, no registry.

**Verified (observed, not assumed):**

- **The released artifact was installed and used in Brave, 2026-09-20** — the owner downloaded the zip
  from the `v0.1.0` release page, loaded it unpacked, and saw the extension card read `0.1.0`. That is
  the install path phase 4 was waiting on: the release zip itself, not `dist/`.
- **The magnet control handed the row's magnet to the OS torrent client**, and the results page stayed
  where it was.
- **The `.torrent` control saved a file** — confirmed to be a real file in Downloads.
- **Every row on that live page resolved** — none stuck on `failed`, and none showing `missing` where
  the page genuinely carried the link. D-004's selectors had never met live markup; this is that first
  measurement, taken on one live results page and the detail pages behind its rows. On those pages the
  loose, shape-based selectors found the real links. One page is not every page shape 1337x serves —
  see D-012.
- **Hover promotion worked on a live page** — a hovered row's icons enabled before the rows above it.
- **The from-source path was exercised too** — the owner also ran `npm run build` and it worked, so the
  README's `dist/` route is not merely documented.
- `npm run check` exits 0 — **112 tests across 10 files**.
- **`v0.1.0` is released** — the tag points at `986bf08`, the Release workflow ran green in 25 s, and
  the published asset was downloaded back and inspected: `manifest.json` at its root stamped `0.1.0`,
  the bundles and icons, and `README.md` with `LICENSE` beside them. That run exercised the
  tag/version guard for the first time.
  [Release page](https://github.com/PrakashSewani/1337x-auto-links/releases/tag/v0.1.0)
- **CI is green on every push**, `9ec44c1` (D-010) and `986bf08` (this release) included.
- The build's failure mode was probed rather than assumed: with `packaging/README.md`, and separately
  `LICENSE`, renamed away, `npm run zip` exits 1 with an `ENOENT` and writes no zip. The one gap, now
  recorded in D-011's consequences: a failed run does not delete a zip an earlier successful run left
  behind, so a local `release/` can hold a stale artifact.
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
- D-010 is held to the same standard: two independent verifications applied **ten mutations** — the
  deadline removed, the deadline timer not cleared, the body read left outside the deadline, the
  write awaited inside its fetch slot, a timed-out task still holding its slot, the write chain
  bypassed, the write chain poisoned, a rejected write rethrown, the writes not awaited before
  resolution, and the cache-read retry cut to one attempt — and a named test caught every one. The
  first verification named five claims with no test behind them; all five are now closed and the
  closures re-checked independently.

**Not verified — browser only, by nature:** how the icons look in a row at the page's font size — the
owner used both controls and reported nothing wrong with them, which is not a judgement on their
appearance at that size. Nor was acceptance-test step 3 reported on either way, so nothing here claims
its console output was checked. And the install ran on the owner's own machine, which carries this
checkout: what phase 4's scope cell rests on is the release artifact being installed and used, not a
machine with none of this repository on it.

**Next action:** no release is pending — every phase is complete and `v0.1.0` is the shipped artifact.
What is left is the **Also open** list below: the D-010 batching follow-up, `registerMessageHandler`'s
rejection → `sendResponse(undefined)` mapping still being untested, and the `test/icons.test.ts`
environment note. Any future release re-runs the acceptance test below against the new zip first.

### Acceptance test

Run once and passed on 2026-09-20 — the owner, in Brave, from the `v0.1.0` release zip installed
unpacked. It is the re-test checklist for any future release: these are the behaviours no fixture can
cover.

1. Download `1337x-auto-links-0.1.0.zip` from the release page, unzip it, and load the unzipped folder
   unpacked in `chrome://extensions`; confirm the card's version reads **0.1.0**. For a local build
   instead: `npm run build`, reload the card, refresh the 1337x page.
2. Each row should show two small icons right after the title. Hover a row deep in the list — its
   icons should enable before the rows above it.
3. Filter the page console by `1337x-auto-links`: rows found, cache hits/misses, each fetch and its
   outcome. The service-worker console (extension card → *service worker*) shows cache and download
   traffic.
4. Click the magnet icon — the torrent client should open with the right torrent and the page must
   stay put. Click the file icon — it should go to `saved` and drop a valid file in Downloads.
5. Report anything else: a control stuck on the alert glyph, a `missing` where the page clearly has
   that link, or a row that never leaves `saving…`. A row reporting `timed out after 15s` is D-010's
   deadline doing its job, not a new bug.

**Also open:** a fourth request type that batches a page's writes into one message — D-010's
follow-up, left for later because serialising already gets most of the win and a new message is a
contract change; `registerMessageHandler`'s rejection → `sendResponse(undefined)` mapping is still
untested, because the handler is not exported; `test/icons.test.ts` runs in the Node environment (the
only test that reads files — the rest use `?raw` HTML); a Chrome Web Store listing stays a non-goal in
`product.md`.
