# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | in progress |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | not started |
| 2 | Core behavior: the one workflow the tool exists for, end to end, with tests | not started |
| 3 | Polish: README, `--help`, error messages, docs — the parts users judge first | not started |
| 4 | Release: tag `v0.1.0`, artifacts published, install path verified from a clean machine | not started |

## Current handoff

**Phase:** 0 — waiting for the project brief.

**Next action:** describe the tool in plain words (see `docs/product.md` for what belongs in it),
then run the `project-bootstrap` skill.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
