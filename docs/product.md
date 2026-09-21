# Product

## What it is

**Magnetline** is a browser extension for Chromium browsers (Brave, Chrome, Edge) that puts the
download action directly into 1337x search results. Every row of a results table gets two icon
controls — a magnet and a `.torrent` file — so a torrent can be sent to the local torrent client or
saved as a file without opening the torrent's own detail page.

## Who it's for

Its author first, on their own Brave install. It ships as a zip artifact attached to a GitHub
release, installed through `chrome://extensions` → Developer mode → Load unpacked. No store listing,
no account, no telemetry.

## The problem it solves

1337x results list the torrents but not their magnet links — those only exist on the detail page.
Today each download is: search → click a result → wait for the detail page → click "Magnet Download"
(or "Torrent Download") → let the OS hand off to the torrent client. Three page loads per torrent,
for information the extension can fetch quietly in the background. The result list already tells you
which torrent you want; the extension removes the rest of the trip.

## Interface

The contract users depend on — the injected controls and what they promise:

- **Injected controls** on every row of a 1337x results table: a magnet control and a `.torrent`
  control, icon-only, inline after the title. Each carries an accessible name, with the reason or the
  in-flight state in its tooltip; the state is also a glyph (saving, saved, failed, or missing).
- `Magnet` hands the row's magnet URI to the OS torrent client without navigating away from the
  results page. Once the row is resolved the control is a real magnet link: the browser's own
  right-click menu can copy it, exactly as it can on a torrent site, and the link can be dragged.
  A row with nothing to carry is not a link at all.
- `.torrent` saves the row's `.torrent` file through the browser's downloads; no client handoff.
- **Prefetch**: results pages resolve their magnets in the background as the page loads — queued and
  rate-limited, never a burst of parallel requests — and results are cached, so controls act
  immediately and a repeat search costs no new requests. Hovering a row promotes its fetch to the
  front, so the torrent you are pointing at resolves first.
- **Failures are visible**: a row whose magnet cannot be resolved says so on the control itself
  instead of failing silently, and a failed fetch is never cached.
- Scope: `1337x.to` only, no options page, no settings, no toolbar UI in v1. The version lives in
  `package.json` and the manifest; the release artifact is a zip.

## Non-goals

- **Not a torrent client.** No in-browser downloading, no WebTorrent, no local helper daemon, no
  native messaging.
- **Not a Cloudflare bypass.** It fetches detail pages the same way a normal browser session does;
  when the site challenges, it reports failure rather than pretending otherwise.
- **Not store-published.** Chrome Web Store / AMO submission and review are out of scope.
- **Not a mirror aggregator.** No proxy or mirror domains in v1.
- **Not a new search UI.** Nothing about 1337x's own pages changes beyond the injected controls: no
  new rows, no new columns, no restyled site markup.
- No telemetry, no remote configuration, no accounts.

## Success looks like

Open a `1337x.to/search/...` page: every row shows working magnet and `.torrent` controls shortly
after render. Clicking the magnet control opens the torrent client with the right torrent and leaves
the results page in place; clicking the `.torrent` control saves a valid file. A repeat search costs
no extra requests thanks to the cache. The first release is done when that workflow works end to end
on a real search page in Brave, loaded unpacked from the release zip.
