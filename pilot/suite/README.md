# Conformance suite

A replicable test of the plugin and the portal on a fictional app, scored against an answer key, so a release can be measured instead of eyeballed. Everything here is dependency-free Node, like the rest of the plugin.

```
gen.mjs        writes the Marquee corpus (ten flows, a design system, planted defects) and answer-key.json
run.mjs        tier 1: drives the MCP tools and CLIs against a portal, records observations, scores them
agent.mjs      tier 2: runs the real skills through headless Claude Code on the same corpus, scores the outcome
ui.mjs         browser checks (Playwright from the sibling design-portal checkout), called by run.mjs
score.mjs      answer key + observations → scorecard.json / scorecard.md, with the delta against the previous run
lib/           the MCP client and the portal API client the tiers share
results/       one folder per run: observations.json, scorecard.{json,md}, run.log, screenshots/
```

## The corpus: Marquee

Tickets for live events. Ten flows with deliberate edge cases, each a scored item:

| Flow | Devices | Planted case |
| --- | --- | --- |
| sign-up | both | `Custom-Locked` state |
| find-an-event | both | data step with Empty/Loading/Error; deep link into buy-tickets |
| buy-tickets | both | declined card; `Main.html` map; 120-character titles; `data-goto` |
| transfer-a-ticket | mobile only | no desktop files |
| request-a-refund | desktop | a required state missing (the waiver path) |
| check-in-scan | both | file names with spaces and uppercase; a step called "Próximo Evento" |
| create-an-event | desktop | 30 screens; a 1.4 MB screen |
| payouts | desktop | table step; link back to create-an-event |
| account-settings | both | a broken link and a broken include |
| notifications | desktop | a step id shared with sign-up |

`--stress` adds two flows the portal must refuse: 450 files and a 21 MB screen. `gen.mjs` is deterministic; a test in `server/test/lib.test.mjs` checks that two generations are identical and that the key matches the files.

## Running

Tier 1 against the local stack (developer sign-in on, seconds):

```
node pilot/suite/run.mjs --portal http://localhost:8787 --dev-admin
```

Tier 1 against staging: the run prints a device sign-in link; a person approves it as admin (every project, everything, 30 days). Everything else is minted from that token through the API. Each run creates its own project (`marquee-<stamp>`), so runs never touch each other or real projects.

```
node pilot/suite/run.mjs --portal https://portal-stg.up.railway.app
```

Tier 2 needs an existing project and a designer token scoped to it in a 0600 file (tier 1 can leave them behind with `--keep`; a person can mint one on Account). The `claude` CLI must be signed in. The installed marketplace copy of the plugin is disabled for the run and the checkout is loaded with `--plugin-dir`, so what is measured is this tree.

```
node pilot/suite/agent.mjs --portal <url> --project <id> --designer-token-file <file> [--client-token-file <file>]
```

Options: `--project <id>`, `--repo <dir>`, `--keep` (leave the generated repo), `--skip stress,concurrency,lost`, `--model <m>` (tier 2). Tokens never go on the command line and never appear in results; `observations.json` is checked for them.

## What is measured

Every metric is a number with a target; `scorecard.md` lists the failing items with what was expected and what was seen. Targets are goals, not excuses: a red row is either a bug to fix or a target to argue about in the pull request that changes it.

| Area | Metrics |
| --- | --- |
| adopt | step-kind accuracy, state coverage, device detection, entry-point and transition recall, questions per flow, avoidable questions (a title, a kind or an entry point the proposal already had right), odd names handled |
| gaps | planted defects found (recall), false alarms (precision) |
| publish | flows pushed, a broken flow isolated from the others, seconds per flow, 429s, mobile flags, screens match, board overlaps, component sheets present and styled, ETag/304/bridge, limits refused and explained |
| feedback | edits landed in the right files (every state of the step, both devices, an include once, HTML-escaped), digest agent-first, dismiss/reply/resolve, supersede reported |
| safety | client scope enforced (waiver, push, agent flag), long comments capped, stale publish refused, force works, tokens never in output, `.mcp.json` safe |
| release | source vs include rows in the diff |
| reliability | concurrent publishes clean, update notice correct, diagnose by run id, expired sign-in handle, failures carry a run id, no unexpected errors |
| handoff | created for every flow, steps, transitions, copy and the waiver in the spec, readable with a dev-agent token |
| roundTrip | a lost repository rebuilt from the portal: dry run unchanged, structure identical |
| ui (tier 1) | console errors, boards rendered, mobile toggle state, no unescaped script, 304 on reload, client sees no staff controls |
| agent (tier 2) | questions listed per flow, turns and cost per step, forced publish, token in transcript, stale attempt refused |

## Reading a run

`results/<stamp>-<tier>-<host>/scorecard.md` is the table; `observations.json` has everything the runner saw; `run.log` the timeline; `screenshots/` the pages. The Δ column compares with the previous committed run for the same tier and host. Commit the scorecards; they are the history.
