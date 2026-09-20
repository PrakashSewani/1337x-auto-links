# Decisions

Append-only log of settled decisions. New entries get the next number, a date, and a sentence of
context. If a decision is reversed, add a new entry that supersedes the old one — never edit
history. The agent records decisions here **before** implementing them (see `AGENTS.md`, rule 2).

## D-001: Stack — TypeScript + esbuild browser extension, no framework

**Date:** 2026-09-19

**Context:** This repository ships one open-source tool: a Chromium extension that injects
`Magnet` and `.torrent` buttons into 1337x result rows (see `docs/product.md`). The stack is chosen
now, from the brief, with every version resolved live on this date.

**Decision:**

- **Language / runtime:** TypeScript **5.9.3**, bundled by esbuild **0.28.2** into plain JS.
  Target runtime is the browser (Chromium Manifest V3); Node is only the build-time runtime.
  Resolved live on Node **24.19.0** / npm **11.17.0**.
- **Why not TypeScript 7:** `typescript@latest` is **7.0.2**, but `typescript-eslint@8.70.0`
  declares `typescript >=4.8.4 <6.1.0`. Adopting TS 7 today would mean dropping type-aware lint
  rules on the async/queue code that most needs them. Revisit when typescript-eslint widens its
  peer range.
- **Test runner:** Vitest **5.0.1** with happy-dom **20.14.5** for DOM-level tests, running against
  HTML fixtures — never the live site (see the Cloudflare note below).
- **Lint / format:** ESLint **10.11.0** (flat config) + typescript-eslint **8.70.0** +
  @eslint/js **10.0.1** + globals **17.12.0**; Prettier **3.9.8**.
- **Types:** @types/chrome **0.3.0**.
- **Build tooling:** `scripts/build.mjs` — esbuild bundle, manifest version stamp, then
  `adm-zip` **0.6.1** writes the release zip. adm-zip only ever writes here; it never extracts
  untrusted input.
- **Package manager:** npm (lockfile committed).
- **Distribution:** a zip attached to a GitHub release, built by CI on `v*` tags
  (`.github/workflows/`). The version lives in `package.json` and is stamped into the manifest at
  build time, so manifest and tag cannot drift. Users install by unzipping and loading unpacked
  from `chrome://extensions`. Publishing stays a manual act — see
  `.commandcode/skills/ship-release/SKILL.md`.

**Considered and rejected:**

- **WXT 0.21.4** — better dev loop (HMR, generated manifests) but a framework layer plus its own
  upgrade cadence for an extension whose UI is two buttons per row.
- **Plasmo / React** — heavier still; no component model is needed for injected rows.
- **Plain JavaScript, no build step** — no typecheck, and MV3 content scripts cannot use bare
  module imports, so shared code between the content script and the service worker needs a bundler.
- **archiver / yazl** for zipping — archiver pulls a dependency tree; yazl has been idle since
  2024; adm-zip has zero dependencies and is actively maintained.
- **A server-side fetcher, a CLI, or a userscript** — 1337x answers anything that is not a real,
  cleared browser session with a Cloudflare challenge. Server-side code cannot fetch these pages at
  all, so the fetching has to live inside the user's own browser. That fact is what makes this an
  extension rather than a CLI, and it is also why tests run on saved fixtures.

**Consequences:**

- The service worker must never fetch site pages; the content script fetches in the page's own
  origin so requests carry the user's session and Cloudflare clearance.
- `src/core/` must not import `chrome.*`, or the logic becomes untestable.
- Any change to the injected button contract, the permissions in the manifest, or the release
  artifact name is a decision, not an edit.

## D-002: Two further pinned dev dependencies — `vite` 8.3.0 and `@types/node` 26.6.2

**Date:** 2026-09-19

**Context:** D-001 pinned the toolchain but not every package the toolchain turns out to require.
Independent verification of the scaffold found both installed and correctly justified by the
lockfile, but absent from the decision log. This log is append-only, so they are recorded here
rather than edited into D-001.

**Decision:** `vite@8.3.0` and `@types/node@26.6.2` are pinned as devDependencies. Both were
resolved live on this date. Nothing else was added; the total is 13 devDependencies and zero
runtime dependencies.

**Why:**

- `vitest@5.0.1` declares `vite` as a **non-optional** peer
  (`^6.4.0 || ^7.0.0 || ^8.0.0`) and imports it at runtime, so it cannot be left to npm's peer
  auto-install and still be pinned deliberately.
- `@types/node` is required by `tsconfig.json`'s `"types": ["chrome", "node"]` — the build script
  and tests use Node APIs — and is a hard dependency of happy-dom. Vitest and Vite declare it only
  as an optional peer.

**Consequences:** Anything else that must be pinned gets its own entry in this log, with the reason
it could not be avoided.

## D-003: The injected controls live inside the row's name cell

**Date:** 2026-09-19

**Context:** The phase-1 scaffold appended a `<button>` directly to each result `<tr>`. A captured
DOM of `1337x.to/popular/movies` (kept, trimmed, as `test/fixtures/list-page.real.html`) shows what
that produces: a non-cell element as a child of a table row, which is invalid — a `<tr>` may contain
only cells. Three valid placements were put to the user, and inline was chosen.

**Decision:** The controls are appended inside the row's **name cell** (`td.coll-1.name`),
immediately after the torrent's title link, wrapped in a single container element. The table's
column count and row heights stay exactly as 1337x ships them. A row with no name cell is skipped
rather than guessed at.

**Rejected:**

- **A new full-width `<tr>` with `colspan="6"` under each torrent** — the most room and the most
  visible, but it doubles the height of every list, and the popular pages carry ~50 rows.
- **An extra `<td>` at the end of the row** — a consistent click position, but it adds a seventh
  column to a table that is already `table-responsive` and narrows the name column.

**Consequences:**

- What gets appended is a container element, not bare buttons, so the controls can be styled and
  later replaced as a unit.
- The placement logic belongs in `src/core/`, where it is unit-testable against the captured fixture
  without a browser.
- The extension's injected markup must never change the site's layout: no new rows, no new columns.
- Captured fact from the same paste: the list page contains **no `magnet:` links whatsoever**, which
  is the evidence behind D-001's conclusion that detail pages have to be fetched.

## D-004: How the two buttons act — handoff, saving, and prefetch limits

**Date:** 2026-09-19

**Context:** Wiring the buttons (phase 2) needs three mechanisms settled: where the magnet handoff
happens, how a `.torrent` file is saved, and how prefetching is bounded. A fourth factor decides the
detail-page selectors: the user asked for the whole phase to be built and verified in one pass rather
than capturing the detail page first, so the markup those selectors must read has still not been seen.

**Decision:**

- **Detail links are found by shape, not by class.** The magnet is the first anchor whose `href`
  starts with `magnet:`; the `.torrent` file is the first anchor whose href path ends in `.torrent`,
  preferring one whose text mentions torrent or download. Each is returned independently, either may
  be absent, and absence is reported on that button. The selectors are deliberately loose so a class
  reshuffle cannot break them, and they are **unverified against live markup** — which is the
  accepted cost of not waiting for a capture. A wrong guess degrades into a visible "not found", not
  a silent wrong download.
- **The magnet handoff happens in the page context, not the service worker.** Clicking `Magnet`
  creates an anchor in the page with the magnet href and clicks it synchronously inside the handler,
  so the click carries user activation and the operating system takes over. Rejected:
  `chrome.tabs.create`/`update` with the magnet URL, which leaves a stray tab or navigates away from
  the results the user is working in.
- **`.torrent` files are saved through `chrome.downloads` from the service worker**, with the
  filename derived from the row's title (sanitised, `.torrent` suffix). The worker reports the
  outcome back to the row, which shows `saved` or `failed`. Rejected: fetching the bytes in the page
  and downloading a blob URL — a page-context blob download cannot be observed, so a blocked
  download would look identical to a successful one.
- **Prefetch is bounded:** at most 2 detail fetches in flight, at least 300 ms between starts, FIFO,
  and no retries. Only whole successful resolutions are cached, in `chrome.storage.local`, keyed by
  torrent id and pruned to a fixed cap. A fetch that failed is never cached, so a later visit tries
  again; a page that genuinely has no magnet is a result and is cached as one.

**Consequences:**

- The service worker owns the cache and the download; the content script keeps owning all network
  traffic to 1337x and all page-context action. Both invariants in `docs/architecture.md` hold.
- The permission set is unchanged: `storage` and `downloads`, nothing added.
- Because the magnet handoff and the download are browser behaviours, **no fixture can prove them**.
  The user's browser is the acceptance test for those two, and the selectors are confirmed or
  corrected by the next capture.
- If `chrome.downloads` turns out to be blocked by Cloudflare's cookie rules, the failure surfaces
  as a failed download in the browser's own download manager — visible, and a new entry here would
  record the fix.

## D-005: The tool is called Magnetline

**Date:** 2026-09-19

**Context:** The repository slug (`1337x-auto-links`) came from the template rename and describes the
mechanism rather than the product. The user asked for a real name.

**Decision:** The product is **Magnetline** — magnet + inline, because the entire point is that the
magnet arrives in the line you are already reading. It is the display name in `src/manifest.json`,
`README.md`, `AGENTS.md` and the docs. The repository slug and the npm package name stay
`1337x-auto-links`; the release artifact keeps its name too.

**Rejected:** `RowMagnet` (blunt, reads as a description rather than a name), `QuickMagnet` (the
"quick" prefix ages badly), `Torque` (memorable, but several unrelated projects already use it).

**Consequences:** `release/1337x-auto-links-<version>.zip` is unchanged, so the release procedure in
the `ship-release` skill needs no edit. Renaming the repository itself would be a separate decision.

## D-006: Hovering a row promotes its fetch

**Date:** 2026-09-19

**Context:** Prefetch is bounded to 2 in flight, 300 ms apart (D-004), so on a 50-row page the row at
the bottom is fetched last — exactly when the user has already decided that is the one they want.

**Decision:** The queue is keyed by torrent id and gains `prioritize(key)`: hovering a row moves its
pending fetch to the front. Every guarantee D-004 makes still holds — promotion changes order only,
and never breaks the concurrency cap or the spacing between starts. A task already in flight cannot
be recalled, so promoting it is a silent no-op, as is promoting an unknown key. Adding a duplicate
key is a programming error and throws, which is safe because `extractResultRows` deduplicates by id.

**Rejected:** fetching on hover instead of on load (would fetch rows the user never considers, at one
request per hovered row); raising the concurrency limit (risks rate-limiting everyone to speed up one
row).

**Consequences:** "FIFO" in `docs/architecture.md` becomes "FIFO except for explicit promotion".

## D-007: The controls are icon-only

**Date:** 2026-09-19

**Context:** Two text buttons per row are wide and visually loud in a table that 1337x already lays
out its own way.

**Decision:** The controls become icon-only buttons inline after the title — a magnet glyph and a
file glyph, sized relative to the page's font and painted in the page's own text colour. **The words
do not disappear:** each control carries an `aria-label` naming its action plus a `title` tooltip, and
state is a glyph plus a `data-state` marker — `saving` (file glyph), `saved` (check), `failed` (alert,
reason in the tooltip), `missing` (the row has no such link, reason in the tooltip). All styling stays
scoped to the extension's own classes.

**Rejected:** text labels (loud, in a row that already carries a title, seeds, size and uploader);
tooltips without `aria-label` (an icon-only control with no accessible name is unusable with a screen
reader).

**Consequences:** What earlier docs called button labels are now accessible names and tooltips, so an
assertion about what a control says must read the accessible name rather than the text content.

## D-008: Post-verification fixes — empty reasons, icon integrity, wording

**Date:** 2026-09-19

**Context:** An independent verification of D-005 through D-007 found no blocking defects but four
worth acting on: an empty failure reason produced a control with **no accessible name at all**
(reachable when a rejection carries an empty message); the icon test parsed only the PNG header, so a
file truncated after it still passed; D-007's "each control carries a tooltip" was broader than the
code, since a `saved` control has nothing to add; and two exported symbols were dead.

**Decision:**

- **An empty reason is replaced, never rendered.** `setFailed` and `setUnresolved` fall back to a
  non-empty accessible name and tooltip, so an icon-only control always has a name. D-007's
  accessibility requirement is absolute: a nameless control is the exact outcome it exists to prevent.
- **The icon test validates the whole file** — walking every chunk, checking each CRC, requiring
  `IEND`, and consuming the file exactly — instead of trusting the header. A truncated icon must fail
  the suite, not the user's install.
- **The tooltip promise is narrowed to what the code does:** every control has an accessible name, and
  the tooltip carries the reason or the in-flight state where there is something to add.
  `docs/architecture.md` and `docs/product.md` are worded to match.
- **Dead exported symbols are removed**, not kept "just in case".

**Rejected:** leaving the empty-reason hole open (it defeats the point of D-007); validating icons only
in a browser (a broken icon should fail CI, not the user's install).

**Consequences:** One finding stays deliberately unaddressed: `npm run check` does not re-run
`npm run icons`, so a hand-edited icon would drift from its generator. The docs only claim the
generator is deterministic, which verification confirmed by hand — recorded here so a future reader
does not mistake it for an oversight.

## D-009: The controls are drawn pictograms, and work in progress has to look like it

**Date:** 2026-09-19

**Context:** The user's verdict on the first pass — thin monochrome strokes painted in `currentColor` —
was that it looked bad at row size; they pointed at The Pirate Bay's inline result icons as the
standard to reach. Reviewing the redesigned preview, one state was still wrong: `saving` rendered
identically to the available state, so clicking the `.torrent` control produced no visible feedback at
all.

**Decision:**

- **The controls are two-tone filled pictograms** — a red horseshoe magnet, a blue arrow into a tray, a
  green check for `saved`, an amber alert for `failed`, and greyed, slashed variants for `missing` —
  each with a dark outline so it holds up on light and dark pages. This supersedes D-007's clause that
  the glyphs are "painted in the page's own text colour"; the rest of D-007 stands.
- **The artwork is authored in this repository.** The Pirate Bay's icons were a style reference, not a
  source: no third-party artwork is copied, resized or traced.
- **Disabled never means invisible.** A disabled control keeps its size and most of its colour;
  `saved` and `failed` keep theirs entirely, because there the colour *is* the outcome.
- **Work in progress must be visible.** `saving` is statically distinguishable from the available
  state and animates while the request is in flight, with the animation disabled under
  `prefers-reduced-motion`. A state that looks identical to the one before it is not feedback.

**Consequences:** Colours are fixed rather than inherited, so any future light/dark adaptation is a new
decision. Judging a change to the glyphs means looking at them: `release/icons-preview.html` plus a
screenshot through the `agent-browser` CLI is this repository's review loop for anything visual.

## D-010: A fetch deadline, and the cache off the fetch path

**Date:** 2026-09-20

**Context:** Reviewing how the links actually load found four ways the bounded prefetch wasted its own
budget. `fetch` had no deadline, so a request that never settles holds one of only two in-flight slots
for the rest of the page load and every row behind it waits — D-004's cap working against the user. A
resolved row's cache write was awaited *inside* its queued task, so a round trip to the worker — a
whole-store read-modify-write of `chrome.storage.local`, once per row — held a fetch slot too. Two
`cache/write` messages handled concurrently could interleave `loadStore()` and `set()`, losing one of
the two entries. And a single cache-read failure made `readCache` return `{}`, turning fifty cache hits
into fifty fresh fetches — the exact traffic the cache exists to prevent.

**Decision:**

- **Every detail fetch has a 15-second deadline** (`AbortController`, timer cleared on settle). Hitting
  it is an ordinary visible failure — both controls report `timed out after 15s`, the row is not cached
  — and it releases the queue slot immediately. D-004's "no retries" is untouched: a timed-out fetch is
  not re-attempted, it fails.
- **A cache write never holds a fetch slot.** The write for a resolved row is started off the queued
  task; the slot belongs to site traffic. The content script still awaits the writes before its work is
  done, so none is left in flight when the page is replaced. A write that fails is logged, as before.
- **The worker serialises `cache/write`.** Writes are chained inside the service worker, so concurrent
  messages cannot lose an entry through an interleaved read-modify-write. This is internal to the
  worker: the message contract in `docs/architecture.md` is unchanged, still the same three requests.
- **The cache read is retried once** before the page degrades to a full re-fetch. It is the only retry
  in the extension, it is a local `chrome.storage` read, and it leaves D-004's rule intact: site
  traffic is still never retried.

**Rejected:** raising the concurrency cap or lowering the spacing to compensate (D-006 already refused
that trade — freeing the slots the writes were occupying buys the throughput for free); a fourth
request type that batches a page's writes into one message (a contract change for a win that
serialising already gets most of — noted in `docs/status.md` as a follow-up, not taken here); leaving a
stalled fetch to hang with no deadline (the row would look like it is still loading forever, which the
UI contract forbids).

**Consequences:** the prefetch invariant in `docs/architecture.md` now names the deadline, the
off-path cache write and the single cache-read retry. A stalled request can no longer hold the queue
behind it, and a cache-read blip costs one retry instead of a page of refetches. User-visible text
gains one reason — `timed out after 15s` — on rows whose fetch hit the deadline.

## D-011: The release zip carries the install README and the licence

**Date:** 2026-09-20

**Context:** The artifact was only ever the built extension: `dist/` with the manifest at the zip
root. Whoever downloaded it got a folder of JavaScript and no instructions — the install steps lived
in the repository's `README.md` and `docs/development.md`, which the download does not contain. The
user asked for a release where unzipping is met with steps, and asked to keep it away from any store:
distribution stays a GitHub release asset, as it always has. A store listing remains a non-goal, so
nothing here goes through a vendor's review or their rules about the site.

**Decision:**

- **The zip gains `README.md` at its root** — a short, self-contained install guide: unzip it, open
  `chrome://extensions`, enable Developer mode, **Load unpacked**, pick the folder, open a 1337x
  search page. It also says how to remove the extension, that unpacked installs never auto-update,
  and which two permissions the extension asks for and why. It links to nothing: a repository link
  would dangle inside a zip that left the repository.
- **The zip gains `LICENSE`**, so the MIT notice travels with the copy, which the licence requires.
- **The built extension stays the payload**: `manifest.json` sits at the zip root, so the folder a
  user unzips is exactly the folder they load unpacked — no wrapper directory and no `dist/`
  subfolder to guess at.
- **The install text is authored in `packaging/README.md`** and copied in by the build script, which
  fails loudly if either file is missing rather than writing a zip without them.
- **A plain-language note in that README** states what the tool is and is not: a client-side helper
  that reads pages the user's own browser can already open, hosting and indexing nothing, with what
  the user chooses to download being their own responsibility. It is a description, not legal advice.

**Rejected:** shipping the source and asking every user to install Node, run `npm ci`, build, and
then load `dist/` (the extension is the product; the toolchain is not); a
`1337x-auto-links-<version>/` wrapper directory (one more step, and one more chance to pick the wrong
folder in the Load-unpacked dialog); leaving the instructions on the release page only (the download
outlives the page, and zips get passed around); publishing to a store (already a non-goal — it would
put a torrent tool through a vendor review and its rules, which is the opposite of what the user
asked for).

**Consequences:** the artifact contract in `docs/architecture.md` now names the two extra root files,
and the build script owns copying them so they cannot drift from the repository. The version stays
**0.1.0**: nothing has been released before, so `v0.1.0` is the first release rather than a bump. A
regression that drops either file is caught twice over: the build fails outright when a source file
is missing, and the artifact is inspected before it ships. Note the one gap this leaves — a failed
`npm run zip` does not delete a zip an earlier successful run left in `release/`, so a local
`release/` can hold a stale artifact. CI never sees it (fresh checkout, and `release/` is
gitignored); it is recorded here so a stale local zip is never mistaken for the current one.
