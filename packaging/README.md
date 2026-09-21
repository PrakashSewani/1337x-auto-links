# Magnetline

A browser extension for Chromium browsers (Brave, Chrome, Edge) that puts the download action into
1337x search results. Every result row gets a magnet control and a `.torrent` control right after its
title, so a torrent can go straight to your torrent client or into your downloads.

This folder **is** the extension — you are holding the unzipped release, and `manifest.json` is what
the browser loads.

## Install

1. Open `chrome://extensions` — type it into the address bar.
2. Turn on **Developer mode**, the switch in the top-right corner.
3. Click **Load unpacked** and select *this folder* (the one containing `manifest.json`).
4. Open a 1337x search page. Every result row gains two small icons after the title; hover one to
   see what it does, and they enable once that row's links are resolved.

Nothing is installed anywhere else, and you can remove it at any time.

## Using it

- **Magnet control** hands the row's magnet link to your torrent client, leaving the results page
  where it is. Once the row is resolved the control is a real magnet link: right-click it and choose
  **Copy link address** to copy the magnet, exactly as you would on a torrent site.
- **`.torrent` control** saves the row's `.torrent` file through your browser's downloads.
- Links resolve in the background — at most two at a time, spaced out, and cached, so a repeat search
  costs no new requests. Hovering a row moves it to the front of the queue.
- If a row cannot be resolved, its control says so: hover it for the reason.

## Updating

An unpacked extension never updates itself. For a newer release, unzip it and either load the new
folder (and remove the old card), or replace this folder's files and press the reload button on the
extension's card.

## Removing it

`chrome://extensions` → the Magnetline card → **Remove**. That is all — nothing else was installed.

## Permissions

It asks for two, and nothing else:

- **`storage`** — the local cache of resolved links (torrent ids, magnets, `.torrent` URLs).
- **`downloads`** — saving a `.torrent` file when you click that control.

It runs only on `1337x.to` pages. There is no analytics, no account, no server, and no remote
configuration.

## What this is — and is not

Magnetline is a client-side helper. It reads the pages your own browser can already open and offers
you the links that are already on them; it hosts and indexes nothing, and it talks to nobody but the
site you are already on. What you choose to download, and whether that is lawful where you live, is
your own responsibility.

## Licence

MIT — see `LICENSE` beside this file.
