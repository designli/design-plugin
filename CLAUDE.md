@AGENTS.md

# CLAUDE.md

`AGENTS.md` holds the rules for every agent. What follows is Claude-only.

- The skills under `skills/` are thin wrappers over `guides/*.md`: change the guide, not the wrapper. `.mcp.json` registers `server/index.mjs`, so the tools arrive as `mcp__designli-design__*`, and as `mcp__plugin_designli-design_designli-design__*` when the tree is loaded with `--plugin-dir`.
- `hooks/impeccable-guard.mjs` blocks `npx impeccable install` and `update` in a session: impeccable is vendored and pinned under `vendor/impeccable/`, upgraded with `scripts/install-impeccable.mjs`.
- End every commit message with the session trailer the history carries: `Claude-Session: <the session URL>`.
