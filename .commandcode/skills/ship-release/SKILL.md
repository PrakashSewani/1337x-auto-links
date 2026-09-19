---
name: ship-release
description: Release and publish this project. Use when the user asks to release, ship, publish, or deploy. Publishing is manual by policy; this skill is filled in with the project's real commands at bootstrap time.
license: MIT
metadata:
  template: 1337x-auto-links
  version: "1"
---

# Ship a release

## Rules (always)

- **Version source of truth:** the manifest of the chosen stack. A release tag is `v<version>`
  and must match it exactly.
- **Publishing is manual.** Give the user exact, copy-pasteable commands; never wire an
  automated publish, and never publish without being asked.
- **CI builds artifacts on tags; publishing is a deliberate human step** with scoped credentials.
- **Record the real procedure here** when the stack is chosen (see "Procedure" below), including
  how to yank a bad release.

## Procedure

The version source of truth is `package.json`. The tag is `v<version>` and must match it exactly;
`npm run build` stamps that version into `dist/manifest.json`, so the manifest cannot drift from
the tag.

Steps 1–3 were run and verified on 2026-09-19. Steps 4–7 have their first outing at `v0.1.0` — if
one of them fails, fix this file rather than improvising in the moment.

1. **Bump the version** — edit `version` in `package.json` and add the CHANGELOG entry. (The
   lockfile's own version field does not need to match; `npm ci` validates dependencies, not the
   root version.)

2. **Run the checks and build the artifact:**

   ```bash
   npm run check   # typecheck -> lint -> format:check -> test -> build
   npm run zip     # writes release/1337x-auto-links-<version>.zip
   ```

   Verified 2026-09-19: `check` exits 0, and the zip contains `manifest.json` at its root alongside
   `content.js` and `background.js`.

3. **Verify the artifact before it ships** — install from the zip, not from `dist/`:

   ```powershell
   Expand-Archive release/1337x-auto-links-<version>.zip -DestinationPath .zip-check -Force
   ```

   Load `.zip-check` unpacked in `chrome://extensions` and confirm the card's version matches the
   tag, then delete `.zip-check`.

4. **Commit** the version bump:

   ```bash
   git add -A
   git commit -m "Release v<version>"
   ```

5. **Tag and push** — this is the deliberate act that triggers CI:

   ```bash
   git tag v<version>
   git push origin main --tags
   ```

6. **Watch CI:**

   ```bash
   gh run watch
   ```

   The Release workflow runs `npm run check`, builds, zips, and attaches the zip to the GitHub
   release created for that tag. Nothing else publishes anywhere — no registry, no store, no
   server, ever.

7. **Verify the release page:** the release for `v<version>` exists and carries
   `1337x-auto-links-<version>.zip` as an asset.

## Publishing

There is no separate publish step: the artifact is the GitHub release asset, and that is the whole
distribution. "Publishing" this tool means a user downloads the zip, unzips it, and loads the
folder unpacked from `chrome://extensions` (Developer mode → Load unpacked) — see
`docs/development.md`.

A Chrome Web Store or AMO listing is **not** part of this procedure and is a non-goal in
`docs/product.md`. It would need a new entry in `docs/decisions.md` first.

## Yanking a bad release

```bash
gh release delete v<version> --yes --cleanup-tag   # removes the release and the tag
```

Then bump the version and repeat the procedure. There is nothing else to unpublish — but note two
things: anyone who already downloaded the bad zip keeps it, and an unpacked install never
auto-updates, so users must install the replacement zip themselves.
