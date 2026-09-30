# AGENTS.md

Rules for any agent working in this repository (Claude Code, Codex, Cursor or another). Read this before your first edit. `CLAUDE.md` adds the Claude-only notes.

## 1. What this repo is, and where the project documentation lives

`designli-design` is the plugin a designer runs in their own product repository: it adopts a static HTML prototype (one file per screen state), publishes releases to the Designli portal, tracks versions by content hash, feeds the client's feedback back into the source and hands flows off to dev agents. The core is harness-neutral: a local MCP server (`server/index.mjs`) plus dependency-free Node scripts; the Claude Code skills are thin wrappers over `guides/*.md`. The portal is the record; this repository is the working copy of the tooling. `README.md` is the map.

The project's own record (decisions, architecture, roadmap, plans, glossary) lives on the portal, not here: the internal section of its docs site, for Designli admins only.

Three ways to read it:

- the site: `<portal>/docs/internal/` in a browser, signed in as an admin;
- Markdown: `<portal>/docs/md/internal/<page>.md` with an admin session or an admin token;
- MCP: the portal's `read_docs` tool with an admin token, for example `page: "internal/decisions"`.

The workflow token this plugin uses is project-scoped, so it acts as a member and gets `NOT_FOUND` for internal pages. Reading them needs a separate admin token, or the portal checkout.

## 2. Before changing anything

- Read the decision index (`internal/decisions`) and `internal/architecture/plugin.md`, which describes this repository's shape.
- Read `reference/portal-api.md` before touching anything that talks to the portal, and `reference/prototype-contract.md` before touching what reads a designer's HTML.
- The reasons behind the current shape are in the records, not in the code. Look there before you propose a different shape.
- A change that contradicts an accepted decision needs a new record that supersedes it, in the same pull request. Say so in the pull request body.
- When you cannot tell whether a decision covers your change, ask the human. Do not guess.

## 3. When to write a decision record

Write one when a choice between real alternatives affects the architecture, the data model, a contract between repositories, the infrastructure, security, or the way we work.

Do not write one for a bug fix, a rename, a dependency bump, a refactor that changes no behaviour, or a choice with no alternative worth naming.

- The records live in the portal repository (`apps/docs/src/content/docs/internal/decisions/`). Write the record there, name this repository in its `repos`, and link the two pull requests to each other.
- One record per decision, four digits, in date order. Take the next free number from the index and use the template in `internal/process`.
- Draft the record from the pull request you are in, name who decided, and let a person approve it.
- Never edit an accepted record, except to add `supersededBy: NNNN`.

## 4. Keeping the model true

- Same pull request: a change to a tool, a CLI, a prompt, an error code, a file the plugin writes or a portal call updates the guide and the README section that describe it.
- Documentation your change makes false is a defect. Fix it now, do not file it.
- Diagrams are Mermaid text next to the prose they explain. One concept per diagram, about fifteen nodes at most, names taken from the code or the glossary.
- The portal's plugin page lists the tools by hand and carries a "Verified against designli-design <version>" line. Bump that line when you add or rename a tool, and let the conformance suite catch the drift.

## 5. Plans and the roadmap

- A feature that takes more than one pull request gets a plan first, on the portal under `internal/plans/<date>-<slug>.md`, following the template in `internal/process`.
- After approval a plan is not rewritten. Append a "Rework" or an "Outcome" section instead.
- A release is a roadmap event: add or close the row on the portal's roadmap when a version ships.

## 6. Definition of done for documentation

- The guide, the README and `reference/portal-api.md` say what the code now does.
- `node --test "server/test/*.test.mjs"` passes.
- Conformance suite tier 1 was run and its scorecard is committed.
- The portal's decision index lists the new record when one was needed, and its plugin page still tells the truth.

## 7. What not to document

- Nothing the code says by itself. Do not restate schemas, flags or signatures.
- No secrets: no tokens, no credentials, no environment files, not even expired ones.
- No client data, and no prototype content from a real project.
- No session notes. An assistant's memory file is not the record; it points at the record.
- Nothing twice. The guides own the workflows; the README points at them.

## 8. Repo-specific rules

**The guides are the agent-facing documentation.** `guides/*.md` are harness-neutral and the skills under `skills/` only point at them. A change in behaviour changes its guide in the same pull request. The server serves the guides as `designli://guide/<name>` and as prompts, so a stale guide misleads every client.

**`reference/portal-api.md` is the contract with the portal.** It is what the plugin implements and what the portal repository points at. A portal change that touches it updates this file in the same release, and this file never describes an endpoint the portal does not serve. The full reference stays on the portal at `/docs`.

**Version bumps, in this order.** Bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` together; a unit test compares them. Run the unit suite, tier 1, and staging plus tier 2. Commit, tag `v<version>`, push both. Then open a design-infra pull request setting `PLUGIN_LATEST_VERSION` on the portal service, and `PLUGIN_MIN_VERSION` only when the API contract changed and older plugins must stop. The tag exists before the portal announces the version. The plugin never updates itself.

**The conformance suite is the regression harness.** Tier 1 on every change: `node pilot/suite/run.mjs --portal http://localhost:8787 --dev-admin`, about two minutes; add `--corpus xl --rounds` for the 21-flow multi-release scenario. Staging and tier 2 (`pilot/suite/agent.mjs`) before a version bump. Commit the scorecard under `pilot/suite/results/`: the scorecards are the history, and the delta column is the review.

**Hooks and the environment.** Once per clone: `git config core.hooksPath .githooks`. Pre-commit then formats the staged files with `npx prettier@3.9.6 --write` and re-stages them, refuses a token or an environment file, syntax-checks staged scripts and runs the unit suite when anything under `server/`, `scripts/`, `pilot/suite/` or `.claude-plugin/` changed. Do not pass `--no-verify` silently. Node >= 22.12, no dependencies in `server/` or `scripts/`, and run the tests as `node --test "server/test/*.test.mjs"`: a bare directory argument fails here.

**Tokens.** Never on a command line, never in the repository, never printed. They are obtained by browser approval and live in `~/.config/designli-design/credentials.json` (0600) or in `DESIGNLI_PORTAL_TOKEN`.
