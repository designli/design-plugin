---
name: init
description: Set up a product repo for prompt-driven flow design. Installs the pinned impeccable build, declares the canonical component library, writes PRODUCT.md and DESIGN.md anchored to the real tokens and components, and publishes a Components sheet canvas. Run once per repo; --refresh after implementation changes tokens or components; --check only verifies the install.
argument-hint: "[--refresh] [--check] [--force]"
disable-model-invocation: true
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/install-impeccable.mjs*), Bash(node *scripts/tokens-css.mjs*), Bash(node *scripts/bundle.mjs*), Bash(node *scripts/portal.mjs*), Bash(node *scripts/flow-check.mjs*), Bash(node *scripts/seed-flow.mjs*), Bash(node .claude/skills/impeccable/scripts/*), Bash(IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/*), Bash(git status *), Bash(git diff *), Bash(git rev-parse *)
---

# init: design DNA from the repo

You are talking to a designer, not a developer. Narrate in plain words ("checking the project", "reading the design system", "saving your components sheet"). Never mention script names, payloads, seeds, helpers or contracts. Ask at most three question rounds in total, each with prefilled options and a recommended default. "I don't know" picks the default and is recorded under Open Questions.

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Run the plugin scripts as given; do not open or read them (they live outside the project and reading them only costs turns).

Never wrap the script path in extra quotes beyond what is shown. Product repo: the current working directory (must be the frontend repo root, where `package.json` lives).

## Step 0: preflight

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs" --json` and read the JSON.

- `NODE` blocker: stop and tell the designer to install Node 24 (`nvm install 24 && nvm use 24`), then rerun.
- If `--check` was passed: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/install-impeccable.mjs" --project . --check`, report OK / MISSING / VERSION_MISMATCH / DRIFT in one sentence, offer `--force` reinstall on anything but OK, and stop.
- If `--force` was passed: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/install-impeccable.mjs --project . --force`, report the result, and continue with the normal steps (or stop here if `--check` was also passed).
- If PRODUCT.md, DESIGN.md and design.json all exist and `--refresh` was NOT passed: say the project is already set up, run Step 6 (validation) only, and stop with the next command.

## Which path

Preflight reports `info.greenfield`. If it is `true` (no UI source files in the repo), follow **Path B: greenfield** below and skip Steps 2-8. Otherwise follow **Path A** (Steps 1-8). Both paths start with Step 1.

## Step 1: install the pinned impeccable

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/install-impeccable.mjs" --project . --json`. It copies impeccable 3.5.0 into `.claude/skills/impeccable/` and `.claude/agents/`, adds `.gitignore` and `.prettierignore` entries, and merges `.claude/settings.json` (update-check off, marketplace impeccable disabled, permission allowlist). Show `git status --short .claude .gitignore .prettierignore` so the designer sees what was written. Nothing here touches product source.

## Step 2: scan the codebase (no questions yet)

Read, in this order, whatever exists: `components.json`, `tailwind.config.*`, the global stylesheet it points at AND `src/app/globals.css` (they may differ), `src/app/fonts.ts`, `src/app/layout.tsx`, every file under `src/components/ui`, `src/components/forms`, `src/components/shared`, the route tree under `src/app` (directory names only), `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`. Count files importing `@mui/material` versus the shadcn alias (`@/components/ui`). Note: icon sets in use, `cn` helpers, theme provider (dark mode), toast library, motion library, and any mismatch between `components.json` and the real file paths.

Write down (for yourself) the **register hypothesis** (product vs brand: app shells, forms, tables, `/admin`, `/account` mean product), the canonical/legacy split, and any token defects (variables referenced but never defined, `hsl()` around hex values, duplicate definitions, flat keys colliding with nested ones, fonts mapped to unset variables). Defects are recorded, never silently fixed.

## Step 3: token truth (optional, recommended)

If a Playwright MCP tool is available and `pnpm dev` (or the project's dev command) can run: start the dev server, open a public route (login or home), and sample computed styles for `body` (font-family, color, background), the muted-foreground text class, headings `h1`..`h5`, `strong`, a primary button, an input, and one active tab. Write `.impeccable/token-truth.json` = `{ "sampledAt", "route", "samples": { "<selector>": { "<property>": "<value>" } }, "defects": [ { "token", "source", "problem" } ] }`. Stop the dev server afterwards. If no browser tool is available, skip this step and say so in one sentence; the defects list still goes into DESIGN.md from the static scan.

## Step 4: question round 1 (canonical library)

Use AskUserQuestion, one question: "Which components should new designs be built from?" Options, first one recommended: the shadcn/Tailwind primitives plus the app's form wrappers and shared shells (name the real paths); the MUI set; both. Then write `design/library.json`:

```json
{
  "canonical": ["src/components/ui", "src/components/forms", "src/components/shared/client"],
  "legacy": ["@mui/material"],
  "legacyAllowedWhere": ["CircularProgress inside Button loading", "Pagination in admin tables"],
  "tokens": ["src/app/globals.css", "tailwind.config.ts"],
  "icons": { "canonical": "lucide-react", "legacy": "@fortawesome/*" },
  "font": "Poppins (next/font, applied on body)",
  "theme": { "dark": true, "designedThemes": ["light"] },
  "componentsCanvas": null,
  "impeccable": "3.5.0",
  "createdAt": "<iso date>"
}
```

## Publish target (asked once, in the same round as the library question)

Add one question to round 1: "Where should flows be published for review?" Options: **Designli portal (recommended)** (asks for the portal URL and project id; defaults: `DESIGNLI_PORTAL_URL` and the repo name), **Local bundle only** (files under `design/flows/<slug>/bundle/`, no sharing), **Claude canvas** (the built-in design canvas artifact; editing in place, org-only sharing). Write the answer to `design/library.json.publish`:

```json
"publish": { "target": "portal", "portal": { "url": "https://design.designli.com", "projectId": "kite" } }
```

For `portal`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/portal.mjs" login-check --url <url>`. If it reports no token, print exactly this and continue with the target still set to portal: "Set your portal token once: `export DESIGNLI_PORTAL_TOKEN=<token>` (or `node <plugin>/scripts/portal.mjs login --url <url> --token <token>`)". If the project does not exist on the portal, `portal.mjs projects --create <id> --name "<name>" --access-code <code>` (ask the designer for the customer access code; never invent one silently). After the Components sheet is authored (Step 7 or B5), push it: `node "${CLAUDE_PLUGIN_ROOT}/scripts/portal.mjs" components push --components design/components`.

## Step 5: question round 2 (product identity) and PRODUCT.md

One grouped AskUserQuestion (up to 4 questions): register (prefilled from the hypothesis), brand personality in three words (offer three options derived from the existing UI), anti-references (offer "none" plus two guesses), accessibility target (default WCAG 2.1 AA; mention any brand color that fails contrast for body text).

Write `PRODUCT.md` yourself from `${CLAUDE_PLUGIN_ROOT}/reference/product-md.template.md`, keeping impeccable's section set exactly (`## Register` holds the bare word `product` or `brand`) and filling `## Codebase Conventions` with the canonical/legacy split, token files, icons, fonts, legacy widgets, and the flow spec paths. Never run impeccable's own `init` interview.

## Step 6: DESIGN.md and design.json through impeccable

Run `IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/context.mjs` once (it must now print PRODUCT.md, not `NO_PRODUCT_MD`).

Invoke the Skill tool with skill `impeccable` (the project-local one) and args:

`document — scan exactly these files: <explicit list: global stylesheet, tailwind config, fonts, layout, every canonical component file, .impeccable/token-truth.json if present>. Register is product. Do not run init. Colors in the frontmatter must be hex. Record the known token defects listed here as Don'ts: <defects>.`

Tell the designer beforehand: "you'll get one round of naming questions; the defaults are fine". With `--refresh`, answer impeccable's refresh/overwrite/merge prompt with "refresh".

Afterwards post-process:
- `DESIGN.md`: the six sections exist in order (Overview, Colors, Typography, Elevation, Components, Do's and Don'ts); frontmatter colors are hex; add under Components a `### Legacy widgets (do not extend)` list and under Do's and Don'ts three Don'ts at minimum: no new `@mui/material` imports; no raw Tailwind palette colors where a brand token exists (name them); no left-border accent stripes. Add each token defect as a Don't with the file and line.
- `.impeccable/design.json`: has `components` covering the primary button variants, the text input (default and error), tabs, card, checkbox, modal and form header where the app has them. Re-run `document` for missing ones rather than hand-writing snippets.
- Write `.impeccable/live/config.json` only if absent: `{"files":["src/app/layout.tsx"],"insertBefore":"</body>","commentSyntax":"jsx","cspChecked":true}` (adjust the layout path to the real one).
- Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow-check.mjs" --design-only` and fix every error.

## Step 7: Components sheet canvas

Read `${CLAUDE_PLUGIN_ROOT}/reference/artboard-rules.md` and `canvas-layout.md`. Author `design/components/*.dc.html` from the real component source and the design.json snippets, one artboard per group, each element tagged with `data-component` and `data-token`:

`CmpButtons` (all variants x sizes, hover, focus ring, disabled, loading), `CmpInputs` (default, label, focus, error, disabled, password, leading icon; select; textarea; checkbox), `CmpSelection` (checkbox, switch, tabs, badge, progress), `CmpCards`, `CmpOverlays` (modal, dialog, popover, toasts), `CmpTypography` (the ramp actually used, form header), `CmpNavbar`, `CmpFooter` and any other shell piece (`CmpCategories`), `CmpColors` (every token swatch with hex and variable name plus a "known defects" note), `CmpLegacy` (static look-alikes of legacy widgets labelled "legacy, do not extend"). Skip layout-only helpers. Chrome artboards (`CmpNavbar`, `CmpFooter`, ...) must be self-contained so flows can `dc-import` them.

Write `design/components/canvas.json` (single page, no `pages` key, rows of 960-wide frames, 120 px gaps, `launch: {"view":"canvas"}`) and `design/README.md` (what lives where, how to run the four verbs).

Then publish the sheet per `library.json.publish.target`:
- `portal`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/portal.mjs" components push --components design/components`; record the project URL (`<portal url>/projects/<id>?tab=components`) in `design/library.json.componentsCanvas`.
- `local`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/bundle.mjs" --components design/components --kind components`; set `componentsCanvas` to `null`.
- `claude-canvas`: invoke the Skill tool with skill `design` and no arguments, purely to learn its base directory (note the "Base directory for this skill" line; do not start a brief), run `node "${CLAUDE_PLUGIN_ROOT}/scripts/seed-flow.mjs" --skill-dir "<base dir>" --flow design/components --title "<Product name> Components" --out design/components/<product-slug>-components.html`, publish that file with the Artifact tool exactly as the design skill's step 4 prescribes, and record the URL. If publishing is declined, keep the local file and set `componentsCanvas` to `null`.

## Step 8: repo hygiene and handover

- If the repo has no `CLAUDE.md`, offer to create one with a `## Design context` section (PRODUCT.md, DESIGN.md, `design/`, `specs/<story>/design-flow.md`, canonical/legacy rules). If it has one, offer to append that section. Do not write without a yes.
- Show `git status --short` and list what should be committed: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/token-truth.json`, `.impeccable/live/config.json`, `.claude/settings.json`, `.gitignore`, `.prettierignore`, `design/**` (sources only; seeded `.html` files are ignored). Suggest a branch name like `chore/design-dna` and a commit message; do not commit unless asked.
- If `components.json` points at wrong paths or a wrong base color, say so and offer the one-line fix separately.
- End with: "Next: `/designli-design:flow "<what you want to design>"`".

## Failure modes

- Node too old or missing: stop with the install command.
- DESIGN.md exists without `--refresh`: validate only.
- impeccable `document` asks something the designer cannot answer: pick the default that matches the existing UI and note it in DESIGN.md's Overview as an assumption.
- Publish denied: continue local-only; never retry the publish on your own.
- Anything you cannot verify from the codebase stays a bracketed placeholder in PRODUCT.md, never an invention.

## Path B: greenfield (no code yet)

Read `${CLAUDE_PLUGIN_ROOT}/reference/greenfield.md`, `artboard-rules.md` and `canvas-layout.md` first. Three question rounds, then you create the design system yourself; impeccable's `document` is NOT run (its seed mode writes no tokens), it is used later by `review` and by `init --refresh` once code exists.

B1. **Product identity round** (one grouped AskUserQuestion, up to 4 questions): what the product is and who it is for (offer "I'll describe it" as the free-text route), register (default `product`), platform (desktop-first web app / mobile-first / both), brand personality in three words (offer three contrasting options). Write `PRODUCT.md` from the template with `## Codebase Conventions` saying greenfield, the intended stack (default "Next.js + Tailwind + shadcn, to be confirmed"), `design/tokens.css` as the token source and `design/components/` as the component source.

B2. **Direction round** (one grouped AskUserQuestion): color strategy plus hue anchor, typography direction, motion energy, three named references and one anti-reference (impeccable's five seed questions, options as listed in `greenfield.md`). Then run `IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/palette.mjs --from "<product name>"` for a seed hue (the designer's anchor wins).

B3. **Directions canvas.** Author three low-fi direction artboards `DirectionA.dc.html`, `DirectionB.dc.html`, `DirectionC.dc.html` in `design/directions/` (each a named axis, same first screen, different systems) plus `canvas.json` (one row, 1440-wide frames, a sticky note per direction naming its axis and tradeoff). Seed with `node "${CLAUDE_PLUGIN_ROOT}/scripts/seed-flow.mjs" --skill-dir "<base dir>" --flow design/directions --title "<Product> Directions" --out design/directions/<product-slug>-directions.html` (learn the base dir by loading the `design` skill with no arguments as in Step 7) and publish it as the design skill's step 4 prescribes. **Third round**: which direction (A, B, C, or mix + one sentence). Record the choice and the canvas url in `design/library.json` (`direction`, `directionsCanvas`).

B4. **Author the system** from the chosen direction, in this order: `DESIGN.md` (frontmatter on line 1 with hex tokens, then the SEED comment line, then the six sections with Named Rules), `.impeccable/design.json` (schemaVersion 2 with 5-10 `ds-` primitives, colorMeta with OKLCH canonical values and 8-step ramps, narrative copied from DESIGN.md), then `node "${CLAUDE_PLUGIN_ROOT}/scripts/tokens-css.mjs"` to produce `design/tokens.css`. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow-check.mjs" --design-only` and fix every error. Write `design/library.json` with `greenfield: true` as in `greenfield.md`.

B5. **Components sheet**: Step 7 as written, except that every component definition element carries `data-component-def="<Export>[/<variant>]"` and the artboards are built from the design.json snippets and `design/tokens.css` values (literal values in inline styles). Publish and record `componentsCanvas`.

B6. **Handover**: `design/README.md`, a `CLAUDE.md` for the future codebase (offer, do not force) that tells developers to scaffold from `design/tokens.css` and DESIGN.md and to run `/designli-design:init --refresh` after the first components exist, then `git status --short` and the next command: `/designli-design:flow "<the product's first flow>"`.

Greenfield failure modes: the designer cannot pick a direction (default to A and record an Open Question in library.json `notes`); the directions canvas cannot be published (describe the three directions in one line each and ask); the designer wants dark mode (design light first, record `theme.designedThemes` and note dark as a follow-up).
