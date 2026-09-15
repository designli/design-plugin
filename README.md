# designli-design

Design product **user flows** by prompting, anchored to the product's real design system, reviewed by the client on the Designli portal (prototype, comments, copy edits), and handed to the designli-skills dev pipeline as a spec.

The core is harness-neutral: a **local MCP server** (tools, resources, prompts) plus dependency-free Node scripts. Claude Code gets the same workflow as slash commands through a thin plugin; any other MCP client gets it through the server. Nothing depends on a particular harness. It wraps a pinned [impeccable](https://github.com/pbakaus/impeccable) 3.5.0 (Apache-2.0) for design DNA, critique, harden and clarify.

## Three ways in

| You use        | Do this                                                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code    | `claude --plugin-dir /path/to/design-tool` (or `/plugin marketplace add /path/to/design-tool` then `/plugin install designli-design@designli-tools`). The plugin registers the `designli-design` MCP server and the slash commands below.                                               |
| Any MCP client | `node /path/to/design-tool/scripts/setup.mjs` in the product repo prints the `mcpServers` config: `designli-design` (local, stdio) and `designli-portal` (the portal's `/mcp`, token by `${DESIGNLI_PORTAL_TOKEN}`). Then use the `setup`, `init`, `flow`, `review`, `handoff` prompts. |
| A shell        | the scripts under `scripts/` (`preflight`, `setup`, `flow-check`, `bundle`, `portal`, `tokens-css`, `dc-to-html`).                                                                                                                                                                      |

Requires Node >= 22.12 (24 recommended, `nvm install 24`).

## Setup (once per repository)

```
node /path/to/design-tool/scripts/setup.mjs
```

It checks Node and git, asks for the portal URL (https only; localhost excepted), reads your personal access token with the echo off (mint a **scoped** one on the portal's Account page: this project, the permissions the workflow needs, an expiry) and stores it in `~/.config/designli-design/credentials.json` (0600, never in the repo; `DESIGNLI_PORTAL_TOKEN` works too), lists the projects the token can see, writes `design/library.json` (`publish`, `harness`), `.mcp.json` for Claude Code (token by environment expansion) and `.gitignore` entries, and prints what to run next: `init` then `flow` for a new product; `portal_pull` and `review` for flows with feedback; `portal_push` for local flows never pushed. The same steps are the `setup` prompt of the server for agent-driven setup.

## Verbs

| Prompt / command                                                                              | What it does                                                                                                                                                                                                                                                 | Questions |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `setup` / `/designli-design:setup`                                                            | Connects the repo to the portal (above)                                                                                                                                                                                                                      | 3         |
| `init` / `/designli-design:init [--refresh] [--check]`                                        | Installs the pinned impeccable, declares the canonical component library, writes `PRODUCT.md` and `DESIGN.md` from the real tokens and components (or, greenfield, from an interview and three directions pushed to the portal), pushes the Components sheet | 3 rounds  |
| `flow` / `/designli-design:flow "<brief>" [--extend <slug>] [--device …] [--prototype]`       | Turns a brief into an ordered path with all states, one artboard per screen state, pushes it to the portal, drafts `design-flow.md`                                                                                                                          | 2 rounds  |
| `review` / `/designli-design:review <slug> [--comments-only] [--critique-only] [--apply-all]` | Pulls comments and copy edits from the portal, folds edits into the sources, critiques and hardens, applies approved changes, pushes, replies and resolves                                                                                                   | 1 round   |
| `handoff` / `/designli-design:handoff <slug> "<story>"`                                       | Gates on states coverage and drift, writes `specs/<story>/design-flow.md` and flattened HTML references for the dev pipeline                                                                                                                                 | 0-1       |

The workflows are the guides in `guides/*.md` (harness-neutral; the skills only point at them). The server serves them as `designli://guide/<name>` and as prompts.

## The MCP server

`node server/index.mjs [--project <dir>]`, stdio, protocol `2025-03-26`, no dependencies.

- **Tools**: `project_status` (call it first), `credentials_status`, `portal_projects`, `setup_write`, `preflight`, `flow_check`, `bundle`, `tokens_css`, `portal_head`, `portal_pull`, `portal_push`, `portal_components_push`, `edits_apply`, `portal_reply`, `portal_resolve`. Each names its CLI twin. No tool accepts a token.
- **Resources**: `designli://guide/*`, `designli://rules/{artboard-rules,canvas-layout,states-checklist}`, `designli://template/{design-flow,product-md,greenfield}`, `designli://reference/portal-api`, `designli://impeccable/*`, `designli://project/{status,library}`.
- **Prompts**: `setup`, `init`, `flow`, `review`, `handoff` (guide + live project status + arguments).

Tests: `node --test server/test/server.test.mjs`.

## What lands in the product repo

| Path                                                                                                                                                               | Commit |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/token-truth.json`, `.impeccable/live/config.json`                                               | yes    |
| `design/library.json`, `design/components/*.dc.html`, `design/flows/<slug>/{flow.json,canvas.json,*.dc.html,design-flow.md,comments.json,text-edits.json,review/}` | yes    |
| `specs/<story>/design-flow.md`, `specs/<story>/design/*.html`                                                                                                      | yes    |
| `.mcp.json` (no secrets), `.gitignore`, `.prettierignore` entries; on Claude Code `.claude/settings.json`                                                          | yes    |
| `.claude/skills/impeccable/`, `.claude/agents/impeccable-*.md` (Claude Code only, installed per machine)                                                           | no     |
| `design/**/bundle/`, `design/**/.review/`, `.impeccable/critique/*`, `.mcp.local.json`                                                                             | no     |
| `~/.config/designli-design/credentials.json` (0600)                                                                                                                | never  |

## Security

- Tokens are never passed on a command line (`portal.mjs login` reads stdin; there is no `--token`), never written into the repository (`setup` refuses a literal `dpat_` in `.mcp.json`; `preflight` warns `TOKEN_IN_REPO`), and travel only over https (localhost excepted).
- Mint scoped tokens: one project, the permissions the workflow needs, an expiry. A scoped admin token acts as a member, not as an admin.
- Every portal write made by an agent is attributed to it ("Claude (designli-design)", role `agent`) on behalf of the token owner.

## Layout

```
.claude-plugin/   plugin.json, marketplace.json (Claude Code packaging)
.mcp.json         registers server/index.mjs for Claude Code
server/           index.mjs (the MCP server), lib/setup.mjs, test/
guides/           setup, init, flow, review, handoff (the workflows, harness-neutral)
skills/           thin Claude Code wrappers over the guides
agents/           artboard-author (optional Claude Code parallel worker)
scripts/          preflight, setup, install-impeccable, flow-check, bundle, dc-to-html, tokens-css, portal
reference/        artboard-rules, canvas-layout, states-checklist, design-flow.template, product-md.template, greenfield, portal-api
vendor/impeccable/3.5.0/   pinned impeccable (PIN.json sha256 map)
hooks/            impeccable-guard (Claude Code only: blocks npx impeccable install/update)
```

## impeccable pin and upgrade

`install-impeccable.mjs --project . [--harness claude|none]` copies the vendored build into `.claude/skills/impeccable/` (Claude Code) or only writes the ignore blocks (other harnesses read impeccable through `designli://impeccable/*`). To upgrade: replace `vendor/impeccable/<version>/`, bump `IMPECCABLE_PIN`, regenerate `PIN.json` with `scripts/gen-pin.mjs --version <v>`, run `--force` in each repo.

## Flow spec contract

`reference/design-flow.template.md` is the section set `flow-check --strict` enforces in `design-flow.md`; `reference/states-checklist.md` the required states per step kind; `reference/artboard-rules.md` the `.dc.html` rules. The portal API essentials are in `reference/portal-api.md`; the full reference lives on the portal at `/docs` (agents: `/docs/md/agents.md` or the `read_docs` tool).
