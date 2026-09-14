# designli-design (plugin name is a placeholder)

A Claude Code plugin that lets Figma-native product designers design **user flows** by prompting, on a visual canvas they can tweak and comment on, anchored to the product's real design system, and hand the result to the designli-skills dev pipeline as a spec.

It runs entirely inside Claude Code (desktop app or CLI) on the designer's own subscription. It builds on two things that already exist:

- the built-in `design` skill (Claude Design's canvas preview): artboards, WYSIWYG editing, PNG/PDF export, comments;
- [impeccable](https://github.com/pbakaus/impeccable) 3.5.0 (Apache-2.0), vendored and pinned: design DNA (`PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`), UX critique, harden and clarify checklists, live mode.

## Verbs

| Command | What it does | Questions |
|---|---|---|
| `/designli-design:init [--refresh] [--check]` | Installs the pinned impeccable into the repo, declares the canonical component library, writes `PRODUCT.md` and `DESIGN.md` from the real tokens and components, publishes a Components sheet canvas | 3 rounds |
| `/designli-design:flow "<brief>" [--extend <slug>] [--device ...] [--prototype]` | Turns a brief into an ordered path with all states, authors one artboard per screen state, publishes the canvas, drafts `design-flow.md` | 2 rounds |
| `/designli-design:review <slug> [--comments-only] [--critique-only] [--apply-all]` | Reads canvas comments, folds in canvas edits, runs a critique and hardening checklist, applies approved changes, republishes, replies and resolves | 1 round |
| `/designli-design:handoff <slug> "<user story title>"` | Gates on states coverage and drift, writes `specs/<story>/design-flow.md` and flattened HTML references for the dev pipeline | 0-1 |
| `/designli-design:iterate <slug>` | Phase 2: impeccable live on the running app, then resync | not in the pilot |

## Install

Development, from the product repo:

```
claude --plugin-dir /path/to/design-tool
claude plugin validate /path/to/design-tool
```

Persistent:

```
/plugin marketplace add /path/to/design-tool      # or designli/design-tool once pushed
/plugin install designli-design@designli-tools
```

Requires Node >= 22.12 (24 recommended, `nvm install 24`).

## What lands in the product repo

| Path | Commit |
|---|---|
| `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/token-truth.json`, `.impeccable/live/config.json` | yes |
| `design/library.json`, `design/components/*.dc.html`, `design/flows/<slug>/{flow.json,canvas.json,*.dc.html,design-flow.md,review/}` | yes |
| `specs/<story>/design-flow.md`, `specs/<story>/design/*.html` | yes |
| `.claude/settings.json`, `.gitignore`, `.prettierignore` entries | yes |
| `.claude/skills/impeccable/`, `.claude/agents/impeccable-*.md` (installed per machine) | no |
| `design/**/*.html` seeded canvases, `extract-*/`, `.seed/`, `.review/`, `.impeccable/critique/*` | no |

## Layout

```
.claude-plugin/          plugin.json, marketplace.json
skills/{init,flow,review,handoff,iterate}/SKILL.md
agents/artboard-author.md
hooks/                   PreToolUse guard that blocks npx impeccable update/install
scripts/                 preflight, install-impeccable, flow-check, seed-flow, dc-to-html, gen-pin (Node ESM, no deps)
reference/               artboard rules, canvas layout, states checklist, design-flow template, PRODUCT.md template
vendor/impeccable/3.5.0/ unmodified impeccable build + LICENSE + NOTICE + PIN.json
pilot/vital-knowledge/   pilot runbook
```

## impeccable pin and upgrade

The plugin invokes the **project-local** copy (`.claude/skills/impeccable/`), never the marketplace plugin, because impeccable's skill text calls its scripts by project-relative path. `install-impeccable.mjs --check` compares every installed file against `vendor/impeccable/3.5.0/PIN.json`; `preflight.mjs` runs that check before every verb. `IMPECCABLE_NO_UPDATE_CHECK=1` (written into the project's `.claude/settings.json`) silences impeccable's daily update ping, and the hook blocks `npx impeccable ... update|install`.

Files the verbs depend on, to diff when upgrading: `SKILL.md`, `scripts/{context,context-signals,detect,critique-storage,design-parser}.mjs`, `reference/{document,critique,harden,clarify,live}.md`.

Upgrade: copy a new build from `~/.claude/plugins/cache/impeccable/impeccable/<v>/` into `vendor/impeccable/<v>/` with `LICENSE` and `NOTICE.md`, run `node scripts/gen-pin.mjs --version <v> --upstream-commit <sha>`, bump `IMPECCABLE_PIN` in `scripts/install-impeccable.mjs`, diff the files above against the previous version, adjust skill text, bump the plugin minor version, rerun the pilot smoke (`init --check`, one `flow`, one `review`).

## Greenfield projects

When preflight finds no UI source files, `init` takes a greenfield path: product identity and direction question rounds, a "Directions" canvas with three low-fi direction artboards to pick from, then the plugin authors `DESIGN.md` (full hex-token frontmatter in impeccable's Stitch format), `.impeccable/design.json` (schemaVersion 2 primitives) and `design/tokens.css` (generated by `scripts/tokens-css.mjs`), and builds the Components sheet from them. Flows reference components in the sheet (`design/components/Cmp*.dc.html#Export/variant`) until code exists; `init --refresh` re-documents from code later. Details: `reference/greenfield.md`.

## Publish targets and the design portal

`design/library.json.publish.target` is `portal` (recommended), `local`, or `claude-canvas`. With `portal`, flows are pushed to the Designli design portal (repo `design-portal`, Bun + Hono + Drizzle + PostgreSQL) where customers click through prototypes, comment on screens and suggest copy edits; the plugin pulls that feedback (`portal.mjs pull`), applies copy edits to the sources (`portal.mjs edits apply`) and pushes new versions (`portal.mjs push`, which requires the last synced head via If-Match and refuses to overwrite unpulled feedback). The REST and MCP contract is in `reference/portal-api.md`. Token: `DESIGNLI_PORTAL_TOKEN` or `portal.mjs login` (stored in `~/.config/designli-design/credentials.json`).

```
node scripts/bundle.mjs --flow design/flows/<slug> --components design/components [--json]
node scripts/bundle.mjs --components design/components --kind components
node scripts/portal.mjs login-check | login --url U --token T | projects [--create ID --name N --access-code C]
node scripts/portal.mjs components push --components design/components [--project P]
node scripts/portal.mjs head|push|pull --flow design/flows/<slug> [--project P] [--note "..."] [--force]
node scripts/portal.mjs edits apply --flow design/flows/<slug>      node scripts/portal.mjs reply|resolve|reopen --flow DIR --thread ID [--text "..."]
```

## Flow spec contract

`reference/design-flow.template.md` is the handoff contract. The designli-skills pipeline depends only on: `# Screen States` file paths, `# States Coverage`, `# Components Used`, `# Design References`, `# Open Questions`. `scripts/flow-check.mjs --strict` enforces the coverage table, token and component drift, naming and secrets before handoff.

## Scripts

```
node scripts/preflight.mjs [--project .] [--require impeccable,dna,library] [--json]
node scripts/install-impeccable.mjs --project . [--check|--force] [--json]
node scripts/flow-check.mjs --flow design/flows/<slug> [--strict] [--allow-local] [--json]
node scripts/flow-check.mjs --design-only
node scripts/seed-flow.mjs --skill-dir <design skill base dir> --flow design/flows/<slug> --components design/components --title "<Title>" --out design/flows/<slug>/<slug>.html
node scripts/dc-to-html.mjs --flow design/flows/<slug> --components design/components --out "specs/<story>/design" [--force]
node scripts/tokens-css.mjs [--project .] [--out design/tokens.css]
node scripts/gen-pin.mjs --version 3.5.0 --upstream-commit <sha>
```

The design skill's base directory changes with every Claude Code release; skills learn it by loading the `design` skill in the session, never by hardcoding it.
