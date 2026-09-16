# Lab: an end-to-end test of the v2 plugin

A fake product (Ferry, a bike rental; brief in the `design-test-lab` repository), one designer session that knows nothing but the plugin, a scripted client, one dev-agent session. Local portal at `http://localhost:8787`, project `lab`.

Roles and tokens (minted on the admin's Account page, scoped to `lab`, kept in files outside every repo):

| Role      | Permissions                                              | Used by                                   |
| --------- | -------------------------------------------------------- | ----------------------------------------- |
| designer  | view, comment, suggest_copy, push, resolve, manage_flows | the designer session (`setup` types it)   |
| client    | view, comment, suggest_copy                              | `client-round.mjs`                        |
| staff     | the designer token again                                 | `client-round.mjs` for waiver and reorder |
| dev agent | view, comment                                            | the dev session (`designli-portal` only)  |

## Before the designer session

1. `/plugin marketplace update designli-tools` then `/plugin update designli-design@designli-tools` (the marketplace points at the plugin folder).
2. `cd ~/Develop/Designli/design-test-lab && claude`. The repo holds only `BRIEF.md`, a `.gitignore` and a local bare remote.
3. Copy the designer token to the clipboard from its file (`pbcopy < <file>`); `setup` reads it with the echo off.

## Session 1: the designer (prompts to paste, in order)

1. `/designli-design:setup` — portal `http://localhost:8787`, project `lab`, harness Claude Code.
2. `Read BRIEF.md and build the prototype it describes as static HTML under design/, following /designli-design:prototype. Leave one required state of one step undesigned on purpose (so the waiver path gets exercised). Do not ask me questions; make reasonable choices and note them in NOTES.md.`
3. `/designli-design:adopt` — answer the grouped questions as a designer would; count them.
4. `/designli-design:publish "first cut"`.
5. Stop. Note in `NOTES.md`: questions asked that the scan could have answered, anything unclear in the guides.

## Between sessions: the client round

```
node <plugin>/pilot/lab/client-round.mjs --project lab --client <client token file> --staff <designer token file> --round 1
```

Posts four threads (one sent to the agent), two copy edits (one inside an include), waives the first missing state, reverses the journey order. Prints the ids.

## Session 1 continued: round 2

6. `/designli-design:feedback` — expect the digest with the sent-to-agent thread first, the two edits applied to the source (the include edited once), the waiver and the new order merged into `flow.json`.
7. `Address the feedback you can in the screens, then /designli-design:publish "round 2: client feedback"`.
8. Run the client round again with `--round 2`, then ask: `Publish "round 3" without pulling feedback first.` Expected: a refusal naming the unpulled items, no `force`.
9. `/designli-design:feedback`, then `/designli-design:publish "round 3"`.
10. `/designli-design:handoff book-a-bike "Book a bike"` (the slug the agent chose).

## Session 2: the dev agent

A Claude Code session in an empty folder with only the `designli-portal` MCP server (`.mcp.json` with the dev token through `${DESIGNLI_PORTAL_TOKEN}`). Prompt: `Read the portal docs page for dev agents, get the latest handoff of project lab, and build the first step of the flow as a single HTML page. List every question the spec did not answer.`

## Session 3: the lost repository

In a fresh clone of the bare remote with `design/flows/*/flow.json` deleted: `/designli-design:adopt --from-portal`, then `/designli-design:publish --dry-run`. Expected: every flow `unchanged`.

## Checklist (fill after each step)

- [ ] setup: refused before a remote existed? wrote `.mcp.json` without a literal token?
- [ ] prototype: one file per state, includes used, links present, mobile files for flow 1?
- [ ] adopt: questions asked (count) / questions the scan could have answered / wrong guesses (kinds, states, entry points)
- [ ] publish 1: release 1, both flows, components pushed, client URL; gaps listed on the portal match the repo's `gaps`
- [ ] canvas: one row per step, one column per state, mobile beside desktop, no overlap, name strips readable (a plain-HTML prototype has no canvas.json; the grid comes from the bundler and the portal re-flows rows by measured height)
- [ ] feedback: digest order (agent first), edits applied (screen, sibling, include once with `screensUsing`), `needsManual`, waiver and order in `flow.json`; one edit declined with `edits_dismiss` shows as a thread on the screen
- [ ] releases: a round that changed only an include reads "N screens changed only through Cmp…", not a list of every screen
- [ ] publish 2: release diff names the changed screens; edits marked applied; replies and resolves on the threads
- [ ] stale path: refused with the fix; no `force`
- [ ] handoff: spec has steps, states, copy, transitions, components, feedback-derived edge cases
- [ ] dev agent: built one step from `get_handoff`; questions the spec did not answer
- [ ] lost repo: `adopt --from-portal` then dry run `unchanged`
- [ ] run log: every failure carried a run id; `diagnose` shows it

Inspect from the reviewer's side: `node <plugin>/scripts/portal.mjs status --project <repo>`, `releases`, `diagnose`, and the portal UI at `/projects/lab`.

## Run of 2026-09-16 (Ferry)

Three rounds, one dev-agent session and the lost-repository check passed. Found and fixed during the run: flow-scoped `gaps` did not know sibling flows; `next` link shape undocumented; pickers guessed as `form`; include edits did not say how many screens they reach; the dev-agents page lacked the HTTP equivalents; the canvas piled every board at (0,0) for a prototype without `canvas.json`; release diffs listed every screen when only an include changed; a copy edit could not be declined with a reason; the portal replaced a pending edit on the same element silently. Not exercised: the waiver path (no required state was missing), now forced by the prompt above.
