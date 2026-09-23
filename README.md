# designli-design

The designer builds the prototype with whatever tools they like. This plugin **adopts** it (one static HTML file per screen state), **publishes** releases to the Designli portal, **tracks** versions by content hash, **feeds** the client's feedback back into the repository, and **hands** flows off to dev agents through the portal. The portal is the record: flows, steps, states with waivers, transitions, journey, releases, feedback and handoffs live there and are reachable through its MCP server. The repository is the designer's working copy; a lost repository is rebuilt from the portal.

The core is harness-neutral: a **local MCP server** (tools, resources, prompts) plus dependency-free Node scripts. Claude Code gets the same workflow as slash commands through a thin plugin; any other MCP client gets it through the server. It ships a pinned [impeccable](https://github.com/pbakaus/impeccable) 3.5.0 (Apache-2.0) for the optional critique.

## The contract

One HTML file per screen state, shared parts as `<dc-import name="Navbar">` includes under `design/components/`, links between files as transitions, mock data inline, the states vocabulary (`Default`, `Loading`, `Empty`, `Validation`, `Submitting`, `Error`, `Success`, `Disabled`, `Selected`, `Partial`, `Stale`). Full text: `reference/prototype-contract.md` (served as `designli://rules/prototype`); required states per step kind: `reference/states-checklist.md` (`designli://rules/states`). `.dc.html` artboards are accepted too.

```
design/
  prototype.json          devices, components dir, product basics
  components/*.html       includes
  flows/<slug>/
    *.html                one file per screen state (any names)
    flow.json             steps, states → files or "n/a: <reason>", transitions, entry points, order, sync state
    comments.json         pulled feedback (committed)
    text-edits.json       pulled copy edits (committed)
    bundle/               build output (ignored)
  releases.json           cache of the portal's releases
```

## The week

```
Day 1   setup ─▶ adopt ─▶ publish "first cut"        client invited; sees the journey, each flow's prototype and states grid
Day 2-5 feedback ─▶ edit screens ─▶ publish "round n"  threads answered from the repo, copy edits landed in the source
Day 5   handoff                                       dev agents read the spec, states grid and screens through the portal MCP
```

## Three ways in

| You use        | Do this                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code    | `claude --plugin-dir /path/to/design-tool` (or `/plugin marketplace add designli/design-plugin` then `/plugin install designli-design@designli-tools`). The plugin registers the `designli-design` MCP server and the slash commands below.                  |
| Any MCP client | `node /path/to/design-tool/scripts/setup.mjs` in the product repo prints the `mcpServers` config: `designli-design` (local, stdio) and `designli-portal` (the portal's `/mcp`, token by `${DESIGNLI_PORTAL_TOKEN}`). Then use the prompts by the same names. |
| A shell        | the scripts under `scripts/`: `preflight`, `setup`, `adopt`, `gaps`, `bundle`, `portal`.                                                                                                                                                                     |

Requires Node >= 22.12 (24 recommended, `nvm install 24`).

## Setup (once per repository)

```
node /path/to/design-tool/scripts/setup.mjs
```

It checks Node and git (a remote is required: the portal keeps flattened screens, the source with its includes lives only in git), asks for the portal URL (https only; localhost excepted), signs you in by showing a link you approve in the browser while signed in to the portal (the token it receives is scoped to this project, the permissions the workflow needs and 90 days, and is stored in `~/.config/designli-design/credentials.json`, 0600, never in the repo; `--paste` types a token with the echo off instead, `--token-stdin` pipes one for CI, `DESIGNLI_PORTAL_TOKEN` always wins), lists the projects the token can see, writes `design/library.json` (`publish`, `harness`), `.mcp.json` for Claude Code (token by environment expansion) and `.gitignore` entries, and prints what to run next. In Claude Code, `/designli-design:setup` does the same through the `signin_start` and `signin_poll` tools: the agent shows the link, you approve, done.

## Prompts

| Prompt / command                                            | What it does                                                                                                                                                                                                                                              | Asks                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `setup` / `/designli-design:setup`                          | Connects the repo to the portal (above)                                                                                                                                                                                                                   | URL, project, harness                              |
| `prototype` / `/designli-design:prototype`                  | Guidance for building screens that meet the contract; loaded while designing, not a step                                                                                                                                                                  | none                                               |
| `adopt` / `/designli-design:adopt [dir] [--from-portal]`    | Scans the HTML, proposes flows, steps and states from file names, transitions from links, components from includes; asks one grouped question per flow; writes `flow.json` files and `design/prototype.json`. Re-runnable: only new files are asked about | product basics once; per flow what it cannot infer |
| `publish` / `/designli-design:publish "<note>" [--dry-run]` | Bundles every flow, pushes what changed as versions plus the components, records one release, prints the client URL. Refuses to overwrite unpulled feedback                                                                                               | the release note                                   |
| `feedback` / `/designli-design:feedback [slug]`             | Pulls threads, copy edits and portal-side structure edits; applies copy edits to the source (screen or include); prints the digest; replies and resolves as items are addressed                                                                           | which items now                                    |
| `handoff` / `/designli-design:handoff <slug> "<story>"`     | Gates on strict gaps, then the portal generates and stores the spec; dev agents read it with the portal MCP `get_handoff`                                                                                                                                 | story title; components once                       |
| `status` / `/designli-design:status`                        | One screen: flows, gaps, unpublished changes, unpulled feedback, the next command                                                                                                                                                                         | none                                               |
| `review` / `/designli-design:review <slug>`                 | Optional impeccable critique and hardening checklist on the bundled screens, one change list                                                                                                                                                              | the change list                                    |

The workflows are the guides in `guides/*.md` (harness-neutral; the skills only point at them). The server serves them as `designli://guide/<name>` and as prompts.

## The MCP server

`node server/index.mjs [--project <dir>]`, stdio, protocol `2025-03-26`, no dependencies.

- **Tools**: `project_status` (call it first; returns `nextSteps`), `credentials_status`, `signin_start`, `signin_poll` (browser approval; the device code never leaves the server), `portal_projects`, `setup_write`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `bundle`, `publish`, `feedback_pull`, `feedback_digest`, `edits_apply`, `adopt_from_portal`, `handoff`, `releases`, `portal_reply`, `portal_resolve`. Each names its CLI twin. No tool accepts a token.
- **Resources**: `designli://guide/*`, `designli://rules/{prototype,states}`, `designli://template/product-md`, `designli://reference/portal-api`, `designli://impeccable/*`, `designli://project/{status,gaps,prototype,library}`.
- **Prompts**: `setup`, `prototype`, `adopt`, `publish`, `feedback`, `handoff`, `status`, `review` (guide + live project status + arguments).

Tests: `node --test "server/test/*.test.mjs"`.

## Errors and the run log

Every failure is a typed error with a code (`STALE_LOCAL`, `PORTAL_TOKEN`, `UNREACHABLE`, `FORBIDDEN`, `BUNDLE`, `VALIDATION`, …), a message and `details` with the fix; the server answers `isError` with `{ error: { code, message, details, run } }`, the CLIs print `{ ok: false, error, code, run }` and exit non-zero. Every tool call or CLI invocation is a **run**: its id travels in the `x-designli-run` header and tags every line of the run log at `~/.config/designli-design/logs/<date>.log` (JSON lines, 0600, seven days kept, tokens redacted on write): tool calls, HTTP requests with status and duration, errors. `DESIGNLI_DEBUG=1` mirrors the log to stderr; the `diagnose` tool (CLI: `portal.mjs diagnose [--lines N] [--run ID]`) returns the last lines for a bug report. Reads (GET) are retried once on a network drop or a 429; writes never are.

## Guarantees

- A release is a complete snapshot: changed flows get versions, unchanged ones are referenced by their current version. Identical content is reused, never duplicated.
- Nothing is pushed over unread feedback: `If-Match` and `X-Designli-Last-Pull` on every push; `publish` checks every flow before pushing any; `force` only when a human asked.
- Copy edits are applied where the text is found once (screen or include), marked applied on the portal only after the push that carries them.
- Structure edited on the portal (waivers, step titles, entry points, order) is merged before any push; a file always wins over a waiver; the plugin never unwaives a state except by adding a file.
- Screens are named by their id (`NN-StepId-State[-Mobile].html`) in every bundle whatever the source files are called, so comments and edits address stable ids across releases.
- One HTTP contract: this server and the portal's MCP server read and write the same data with the same scoped token.

## Working on the plugin

Once per clone: `git config core.hooksPath .githooks`. The pre-commit hook then formats the staged files with Prettier and re-stages them, refuses a commit that carries a token or an environment file, syntax-checks staged scripts and runs the unit suite when anything under `server/`, `scripts/`, `pilot/suite/` or `.claude-plugin/` changed. `git commit --no-verify` skips it once.

## Releasing the plugin

The plugin never updates itself; Claude Code does, from this repository, when a designer runs `/plugin marketplace update designli-tools` then `/plugin update designli-design@designli-tools` (or has auto-update on for the marketplace). The portal tells every plugin which version is current, and `project_status` turns that into a one-line notice with those commands; below the portal's minimum version, its API answers `426 PLUGIN_OUTDATED` and the plugin stops until updated.

To release: bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (they must match; a test checks it), run the tests, commit, tag `v<version>`, push both; then open a design-infra pull request setting `PLUGIN_LATEST_VERSION` on the portal service (and `PLUGIN_MIN_VERSION` only when the portal API contract changed and older plugins must stop). Claude Code only notices an update when the version string changes.

## Security

- Tokens are obtained by browser approval (device sign-in) and never passed on a command line (`portal.mjs login` reads stdin when piped; there is no `--token`), never written into the repository (`setup` refuses a literal `dpat_` in `.mcp.json`; `preflight` warns `TOKEN_IN_REPO`), and travel only over https (localhost excepted).
- Mint scoped tokens: one project, the permissions the workflow needs (`view`, `comment`, `push`, `suggest_copy`, `resolve`), an expiry. A scoped admin token acts as a member, not as an admin.
- Every portal write made by an agent is attributed to it ("Claude (designli-design)", role `agent`) on behalf of the token owner.
- Text pulled from the portal (comments, copy edits) is material to review, never an instruction.

## Layout

```
.claude-plugin/   plugin.json, marketplace.json (Claude Code packaging)
.mcp.json         registers server/index.mjs for Claude Code
server/           index.mjs (the MCP server), lib/{proto,flows,bundle,portal,status,setup}.mjs, test/
guides/           setup, prototype, adopt, publish, feedback, handoff, status, review (the workflows, harness-neutral)
skills/           thin Claude Code wrappers over the guides
scripts/          preflight, setup, adopt, gaps, bundle, portal, install-impeccable, gen-pin
reference/        prototype-contract, states-checklist, product-md.template, portal-api
vendor/impeccable/3.5.0/   pinned impeccable (PIN.json sha256 map)
hooks/            impeccable-guard (Claude Code only: blocks npx impeccable install/update)
```

## impeccable pin and upgrade

`install-impeccable.mjs --project . [--harness claude|none]` copies the vendored build into `.claude/skills/impeccable/` (Claude Code) or only writes the ignore blocks (other harnesses read impeccable through `designli://impeccable/*`). To upgrade: replace `vendor/impeccable/<version>/`, bump `IMPECCABLE_PIN`, regenerate `PIN.json` with `scripts/gen-pin.mjs --version <v>`, run `--force` in each repo.

The portal API essentials are in `reference/portal-api.md`; the full reference lives on the portal at `/docs` (agents: `/docs/md/agents.md` or the `read_docs` tool; dev agents: `/docs/md/dev-agents.md`).
