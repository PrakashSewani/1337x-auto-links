# Magnetline

A browser extension for Chromium browsers (Brave, Chrome, Edge) that puts the download action into
1337x search results. Every result row gets a magnet control and a `.torrent` control right after its
title, so a torrent can go straight to your torrent client or into your downloads — no more opening
each torrent's detail page just to reach its magnet link.

*(The repository keeps its slug, `1337x-auto-links`; the extension ships as Magnetline.)*

> **Status: `v0.1.0` is released, and the workflow has been confirmed end to end on a real 1337x
> page** — the zip from the release was downloaded, installed unpacked in Brave, and its magnet
> handoff, `.torrent` save and live link resolution all worked (2026-09-20). Every result row
> resolves its magnet and `.torrent` link through a bounded background prefetch. The live state of
> the project is in [docs/status.md](./docs/status.md).

## Install

Download the zip from the
[latest release](https://github.com/PrakashSewani/1337x-auto-links/releases/latest) and unzip it —
the extracted folder *is* the extension, with a `README.md` inside it repeating these steps. Then:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and pick the folder you unzipped.
3. Open a 1337x search page — every result row gains its magnet and `.torrent` controls.

Nothing is in a browser store, and an unpacked install never auto-updates: to move to a newer
release, unzip it and load it the same way, replacing the old copy.

**From source instead:** `npm ci --include=dev` (the flag matters on some machines — see
[docs/development.md](./docs/development.md)), then `npm run build` writes `dist/`, which you load
unpacked the same way. `npm run zip` produces the release artifact yourself.

## How it works

1337x search results list torrents but not their magnet links — those exist only on each torrent's
detail page. The extension resolves them in the background for the rows you are looking at, caches
the answers, and so can offer the magnet (hands off to your torrent client) and the `.torrent` file
(saves it through the browser) right in the list.

There is no server, no account, and no telemetry. Every request comes from your own browser session
— which is also the only kind of request the site answers at all.

## Development

```bash
npm ci --include=dev   # --include=dev matters on some machines — see docs/development.md
npm run check          # typecheck, lint, format, tests, build — the one command that must pass
npm run build          # writes dist/, which is what you load unpacked in the browser
npm run watch          # rebuild on save while developing
npm run zip            # writes release/1337x-auto-links-<version>.zip
```

Prerequisites, the full command list, and this project's environment quirks are in
[docs/development.md](./docs/development.md).

## Docs

- [docs/product.md](./docs/product.md) — what it is, who it's for, what it is not
- [docs/architecture.md](./docs/architecture.md) — shape, components, contracts, invariants
- [docs/decisions.md](./docs/decisions.md) — why the stack is what it is
- [docs/status.md](./docs/status.md) — where the project stands right now
- [docs/development.md](./docs/development.md) — setup, commands, troubleshooting

## License

[MIT](./LICENSE)
