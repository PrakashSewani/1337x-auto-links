# Development

Prerequisites, setup and the exact commands for this project. Only commands that have actually
been run are listed here.

## Prerequisites

- **Node 24.x** and **npm 11.x** — developed on Node 24.19.0 / npm 11.17.0.
- A **Chromium browser** (Brave, Chrome, Edge) for loading the extension while developing.
- Optional: the **GitHub CLI** (`gh`) for watching releases — 2.97.0 on the development machine.

## Setup

```bash
git clone https://github.com/PrakashSewani/1337x-auto-links.git
cd 1337x-auto-links
npm ci --include=dev
```

`--include=dev` is not decoration: this machine has `NODE_ENV=production` and npm's `omit=dev`
configured globally, so a plain `npm install` / `npm ci` installs nothing ("audited 1 package").
CI on `ubuntu-latest` has no such setting.

## Commands

| Command | What it does |
|---|---|
| `npm run check` | **The one command that must pass.** typecheck → lint → format:check → test → build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, flat config, type-aware |
| `npm run format` / `format:check` | Prettier write / verify |
| `npm run test` | Vitest against `test/**/*.test.ts` in a happy-dom environment |
| `npm run build` | Bundles to `dist/` and stamps `package.json`'s version into `dist/manifest.json` |
| `npm run watch` | esbuild in watch mode — rebuilds `dist/` on save (entry points only: a change to `src/manifest.json` needs a restart) |
| `npm run zip` | `build`, then writes `release/1337x-auto-links-<version>.zip` |
| `npm run icons` | Regenerates the extension's PNG icon set from code — deterministic, so rerunning with no changes produces identical bytes |

## Running the extension while developing

1. `npm run build` (or `npm run watch` and leave it running).
2. In the browser: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select
   the `dist/` folder.
3. After each rebuild, press the reload button on the extension's card, then refresh the 1337x tab.

Nothing is installed into the browser permanently, and uninstalling is the same card's **Remove**.

## Testing

- Tests run against HTML fixtures in `test/fixtures/`, never against the live site: 1337x answers
  automated and non-browser requests with a Cloudflare challenge (see D-001), so the suite would be
  flaky and slow if it depended on it. **A test that needs the network is a bug.**
- `test/fixtures/list-page.real.html` — **real** markup, captured from `1337x.to/popular/movies`
  and trimmed to the table plus three rows, with the extension's own injected artifacts removed.
  This is what the selectors are held to; re-capture it when 1337x reshuffles its markup.
- `test/fixtures/search-results.sample.html` is **synthetic** and stays that way — it holds the edge
  cases the real capture does not: a duplicate torrent id, a stray `/torrent/` link outside any row,
  and a title carrying surrounding whitespace.

## Environment

There is no configuration, no `.env`, no secrets and no runtime environment variables for the
extension itself. Node's environment matters only for tooling, and this machine is set up unusually:

- `NODE_ENV=production` and npm `omit=dev` are set **globally** → always pass `--include=dev` when
  installing.
- `NODE_ENV=production` also leaks into Vitest: Vite treats it as a production build and stubs
  `node:*` built-ins, so a test reading a fixture with `node:fs` fails with
  `ERR_UNKNOWN_BUILTIN_MODULE`. The suite avoids Node built-ins (fixtures are imported with Vite's
  `?raw`) rather than depending on the ambient value.
- An npm `allow-scripts` policy blocks postinstall scripts (including esbuild's). esbuild still
  works here — its binary arrives through `optionalDependencies`.

## Releases and deploys

Manual by policy. Nothing is published to any registry or store from this repo, and no workflow
publishes on its own: pushing a `v<version>` tag is the deliberate human act that makes CI build
and attach the zip. The exact procedure lives in
[`.commandcode/skills/ship-release/SKILL.md`](../.commandcode/skills/ship-release/SKILL.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm install` / `npm ci` installs 0 packages | `NODE_ENV=production` + `omit=dev` are set globally — use `npm ci --include=dev` |
| Vitest dies with `ERR_UNKNOWN_BUILTIN_MODULE` | Ambient `NODE_ENV=production`; keep tests free of `node:*` imports, or unset `NODE_ENV` |
| Buttons don't appear on a page | Only pages with result rows get controls; check the page actually has a results table |
| A control shows the alert glyph | The row could not be resolved — hover the control for the reason. A failed row is never cached, so a later visit retries it |
| A control shows `missing` (tooltip `no magnet` / `no .torrent`) | The detail page was fetched but that link was not found in it: the D-004 selectors need correcting from a fresh capture of the page |
| "Service worker registration failed" | The worker bundle must stay a self-contained IIFE; check that a new import didn't turn it into a module |
| Edits don't show up | Reload the extension card in `chrome://extensions`, then refresh the page |

## Logs

Both contexts log through one namespaced logger, so a single console filter — `1337x-auto-links` —
shows everything:

- **Page console** (F12 on a 1337x tab) — the content script: rows found, cache hits and misses, each
  detail fetch with its outcome, the magnet handoff, download requests, and every failure with its
  reason.
- **Service-worker console** — `chrome://extensions` → this extension → *service worker*: cache reads
  and writes, and the download requests the browser is asked to make.
- Setting `DEBUG` to `false` in `src/core/log.ts` silences all of it; rebuild afterwards.
