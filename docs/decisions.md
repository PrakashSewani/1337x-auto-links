# Decisions

Append-only log of settled decisions. New entries get the next number, a date, and a sentence of
context. If a decision is reversed, add a new entry that supersedes the old one — never edit
history. The agent records decisions here **before** implementing them (see `AGENTS.md`, rule 2).

## D-001: Stack selection — pending

**Date:** —

**Decision:** Not made yet, on purpose. The stack is chosen when the tool's requirements are
known — see the `project-bootstrap` skill.

Replace this entry before scaffolding, and include:

- Language / runtime — with the exact versions resolved **live** at that moment (not from memory,
  not copied from anywhere).
- Distribution: where users install it from (registry, release binaries, container), and how CI
  produces that artifact.
- Test runner, lint/format, build tool, package manager.
- What was considered and rejected, and why (one line each).

The chosen stack is then described in `docs/architecture.md`, and its commands in
`docs/development.md`.
