# Contributing

Thanks for wanting to help. This project is small on purpose — please keep it that way.

## Setup

```bash
npm ci --include=dev
```

`--include=dev` is not optional on machines that set `NODE_ENV=production` or npm's `omit=dev`: a
plain `npm install` installs nothing there. Prerequisites, the full command list and known
environment quirks live in [docs/development.md](./docs/development.md).

## Before you open a PR

Run the check command:

```bash
npm run check
```

It runs typecheck, lint, Prettier, the test suite and the build, in that order — CI runs exactly the
same thing, so a green local check means a green CI. Nothing else needs to pass.

## What a good PR looks like

- One focused change, described in the PR template.
- Docs updated when behavior changes: `docs/` is the source of truth and the code follows it
  (`AGENTS.md`, rule 2).
- Tests for behavior that can actually break — the suite runs against HTML fixtures in
  `test/fixtures/`, never the live site (1337x answers non-browser requests with a Cloudflare
  challenge, so a network-dependent test would be both slow and flaky).
- No new dependencies without a note explaining why.

## Changes that are decisions, not edits

Raise these in `docs/decisions.md` first, before writing the code:

- the injected controls users interact with (their accessible names, what a click does),
- the permissions declared in `src/manifest.json`,
- the release artifact's name or layout,
- anything that adds a network destination other than 1337x itself.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened — versions included. For
anything involving the injected buttons, include the page URL and a screenshot of the row.
