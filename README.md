# Magnetline

A browser extension for Chromium browsers (Brave, Chrome, Edge) that puts the download action into
1337x search results. Every result row gets a magnet control and a `.torrent` control right after its
title, so a torrent can go straight to your torrent client or into your downloads — no more opening
each torrent's detail page just to reach its magnet link.

*(The repository keeps its slug, `1337x-auto-links`; the extension ships as Magnetline.)*

> **Status: implemented, awaiting its first real-browser test.** Every result row resolves its magnet
> and `.torrent` link through a bounded background prefetch, the magnet is handed to your torrent
> client, and `.torrent` files are saved through the browser. The suite covers this against fixtures;
> the two browser-only behaviours — the handoff and the download — are proven on a real page, not
> here. The live state of the project is in [docs/status.md](./docs/status.md).

## Install

Nothing is published anywhere yet — build it and load it unpacked:

```bash
npm ci --include=dev   # --include=dev matters on some machines — see docs/development.md
npm run build          # writes dist/
```

Then `chrome://extensions` → **Developer mode** → **Load unpacked** → pick the `dist/` folder.
Reload the extension card after each rebuild, then refresh the page. `npm run zip` produces the same
files as a release zip.

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
