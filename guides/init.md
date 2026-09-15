# init: design DNA from the repo

You are talking to a designer, not a developer. Narrate in plain words ("checking the project", "reading the design system", "saving your components sheet"). Never mention script names, payloads or contracts. Ask at most three question rounds in total, each a single grouped question with prefilled options and a recommended default. "I don't know" picks the default and is recorded under Open Questions.

Tools: the `designli-design` MCP server (`project_status`, `preflight`, `tokens_css`, `flow_check`, `bundle`, `portal_components_push`, `portal_projects`) or the equivalent scripts under the plugin's `scripts/` directory (each tool names its CLI twin in its description). Product repo: the current working directory (the frontend repo root, where `package.json` lives, or an empty repository for a new product).

## Step 0: status

Call `project_status` (CLI: `node <plugin>/scripts/preflight.mjs --json`).

- `SETUP` blocker: the repo is not connected to the portal. Run the `setup` guide first, then come back.
- `NODE` blocker: stop and tell the designer to install Node 24 (`nvm install 24 && nvm use 24`), then rerun.
- `--check` was asked: report the impeccable install status (OK / MISSING / VERSION_MISMATCH / DRIFT) in one sentence, offer a forced reinstall on anything but OK, and stop.
- `--force` was asked: reinstall impeccable, report, then continue (or stop if `--check` was also asked).
- If PRODUCT.md, DESIGN.md and `.impeccable/design.json` all exist and `--refresh` was NOT asked: say the project is already set up, run Step 6 (validation) only, and stop with the next command.

## Which path

`project_status` reports `greenfield`. If it is `true` (no UI source files in the repo), follow **Path B: greenfield** below and skip Steps 2 to 8. Otherwise follow **Path A** (Steps 1 to 8). Both start with Step 1.

## Step 1: install the pinned impeccable

Run the impeccable installer (`node <plugin>/scripts/install-impeccable.mjs --project . --harness <claude|none> --json`; the harness is the one recorded by setup in `design/library.json.harness`, default `none`). It adds `.gitignore` and `.prettierignore` entries and, for Claude Code only, copies impeccable 3.5.0 into `.claude/skills/impeccable/` plus the permission allowlist in `.claude/settings.json`. Show `git status --short` so the designer sees what was written. Nothing here touches product source. Impeccable's references (product register, critique, harden, clarify) are also readable as `designli://impeccable/<name>` resources whatever the harness.

## Step 2: scan the codebase (no questions yet)

Read, in this order, whatever exists: `components.json`, `tailwind.config.*`, the global stylesheet it points at AND `src/app/globals.css` (they may differ), `src/app/fonts.ts`, `src/app/layout.tsx`, every file under `src/components/ui`, `src/components/forms`, `src/components/shared`, the route tree under `src/app` (directory names only), `README.md`, `AGENTS.md` or `CLAUDE.md`, `ARCHITECTURE.md`. Count files importing `@mui/material` versus the shadcn alias (`@/components/ui`). Note: icon sets in use, `cn` helpers, theme provider (dark mode), toast library, motion library, and any mismatch between `components.json` and the real file paths.

Write down (for yourself) the **register hypothesis** (product vs brand: app shells, forms, tables, `/admin`, `/account` mean product), the canonical/legacy split, and any token defects (variables referenced but never defined, `hsl()` around hex values, duplicate definitions, flat keys colliding with nested ones, fonts mapped to unset variables). Defects are recorded, never silently fixed.

## Step 3: token truth (optional, recommended)

If a browser automation tool is available and the project's dev command can run: start the dev server, open a public route (login or home), and sample computed styles for `body` (font-family, color, background), the muted-foreground text class, headings `h1`..`h5`, `strong`, a primary button, an input, and one active tab. Write `.impeccable/token-truth.json` = `{ "sampledAt", "route", "samples": { "<selector>": { "<property>": "<value>" } }, "defects": [ { "token", "source", "problem" } ] }`. Stop the dev server afterwards. If no browser tool is available, skip this step and say so in one sentence; the defects list still goes into DESIGN.md from the static scan.

## Step 4: question round 1 (canonical library)

Ask one question: "Which components should new designs be built from?" Options, first one recommended: the shadcn/Tailwind primitives plus the app's form wrappers and shared shells (name the real paths); the MUI set; both. Then write `design/library.json` (keep the `publish` and `harness` blocks setup wrote):

```json
{
  "canonical": ["src/components/ui", "src/components/forms", "src/components/shared/client"],
  "legacy": ["@mui/material"],
  "legacyAllowedWhere": ["CircularProgress inside Button loading", "Pagination in admin tables"],
  "tokens": ["src/app/globals.css", "tailwind.config.ts"],
  "icons": { "canonical": "lucide-react", "legacy": "@fortawesome/*" },
  "font": "Poppins (next/font, applied on body)",
  "theme": { "dark": true, "designedThemes": ["light"] },
  "componentsUrl": null,
  "impeccable": "3.5.0",
  "createdAt": "<iso date>",
  "publish": {
    "target": "portal",
    "portal": { "url": "https://portal.designli.co", "projectId": "kite" }
  }
}
```

`publish.target` is `portal` (flows are reviewed on the Designli portal, the default) or `local` (bundles only, nothing shared). Setup already filled it; if it is missing, ask where flows should be published and write it, then have the designer run setup for the token.

## Step 5: question round 2 (product identity) and PRODUCT.md

One grouped question (up to 4 parts): register (prefilled from the hypothesis), brand personality in three words (offer three options derived from the existing UI), anti-references (offer "none" plus two guesses), accessibility target (default WCAG 2.1 AA; mention any brand color that fails contrast for body text).

Write `PRODUCT.md` yourself from `reference/product-md.template.md` (resource `designli://template/product-md`), keeping impeccable's section set exactly (`## Register` holds the bare word `product` or `brand`) and filling `## Codebase Conventions` with the canonical/legacy split, token files, icons, fonts, legacy widgets, and the flow spec paths. Never run impeccable's own `init` interview.

## Step 6: DESIGN.md and design.json through impeccable

Run `IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/context.mjs` once (Claude Code; on other harnesses run the same script from the plugin's `vendor/impeccable/3.5.0/skills/impeccable/scripts/`). It must now print PRODUCT.md, not `NO_PRODUCT_MD`.

Follow impeccable's `document` command (its reference is `designli://impeccable/document`; in Claude Code the project-local `impeccable` skill runs it): "scan exactly these files: <explicit list: global stylesheet, tailwind config, fonts, layout, every canonical component file, .impeccable/token-truth.json if present>. Register is product. Do not run init. Colors in the frontmatter must be hex. Record the known token defects listed here as Don'ts: <defects>."

Tell the designer beforehand: "you'll get one round of naming questions; the defaults are fine". With `--refresh`, answer impeccable's refresh/overwrite/merge prompt with "refresh".

Afterwards post-process:

- `DESIGN.md`: the six sections exist in order (Overview, Colors, Typography, Elevation, Components, Do's and Don'ts); frontmatter colors are hex; add under Components a `### Legacy widgets (do not extend)` list and under Do's and Don'ts three Don'ts at minimum: no new `@mui/material` imports; no raw Tailwind palette colors where a brand token exists (name them); no left-border accent stripes. Add each token defect as a Don't with the file and line.
- `.impeccable/design.json`: has `components` covering the primary button variants, the text input (default and error), tabs, card, checkbox, modal and form header where the app has them. Re-run `document` for missing ones rather than hand-writing snippets.
- Write `.impeccable/live/config.json` only if absent: `{"files":["src/app/layout.tsx"],"insertBefore":"</body>","commentSyntax":"jsx","cspChecked":true}` (adjust the layout path to the real one).
- Run `flow_check` with `designOnly: true` (CLI: `flow-check.mjs --design-only`) and fix every error.

## Step 7: Components sheet

Read `reference/artboard-rules.md` and `reference/canvas-layout.md` (resources `designli://rules/artboard-rules`, `designli://rules/canvas-layout`). Author `design/components/*.dc.html` from the real component source and the design.json snippets, one artboard per group, each element tagged with `data-component` and `data-token`:

`CmpButtons` (all variants x sizes, hover, focus ring, disabled, loading), `CmpInputs` (default, label, focus, error, disabled, password, leading icon; select; textarea; checkbox), `CmpSelection` (checkbox, switch, tabs, badge, progress), `CmpCards`, `CmpOverlays` (modal, dialog, popover, toasts), `CmpTypography` (the ramp actually used, form header), `CmpNavbar`, `CmpFooter` and any other shell piece (`CmpCategories`), `CmpColors` (every token swatch with hex and variable name plus a "known defects" note), `CmpLegacy` (static look-alikes of legacy widgets labelled "legacy, do not extend"). Skip layout-only helpers. Chrome artboards (`CmpNavbar`, `CmpFooter`, ...) must be self-contained so flows can `dc-import` them.

Write `design/components/canvas.json` (rows of 960-wide frames, 120 px gaps) and `design/README.md` (what lives where, how to run the four verbs).

Then publish the sheet per `library.json.publish.target`:

- `portal`: `portal_components_push` (CLI: `portal.mjs components push --components design/components`); record `<portal url>/projects/<id>?tab=components` in `design/library.json.componentsUrl`.
- `local`: `bundle` with `components: "design/components"` (CLI: `bundle.mjs --components design/components --kind components`); set `componentsUrl` to `null`.

## Step 8: repo hygiene and handover

- If the repo has no agent instructions file (`AGENTS.md`, or `CLAUDE.md` when the harness is Claude Code), offer to create one with a `## Design context` section (PRODUCT.md, DESIGN.md, `design/`, `specs/<story>/design-flow.md`, canonical/legacy rules). If it has one, offer to append that section. Do not write without a yes.
- Show `git status --short` and list what should be committed: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/token-truth.json`, `.impeccable/live/config.json`, `.mcp.json`, `.gitignore`, `.prettierignore`, `design/**` (sources only; `bundle/` is ignored) and, on Claude Code, `.claude/settings.json`. Suggest a branch name like `chore/design-dna` and a commit message; do not commit unless asked.
- If `components.json` points at wrong paths or a wrong base color, say so and offer the one-line fix separately.
- End with: "Next: the `flow` prompt with what you want to design" (in Claude Code: `/designli-design:flow "<what you want to design>"`).

## Failure modes

- Node too old or missing: stop with the install command.
- DESIGN.md exists without `--refresh`: validate only.
- impeccable `document` asks something the designer cannot answer: pick the default that matches the existing UI and note it in DESIGN.md's Overview as an assumption.
- The portal push is refused (no token, no permission): keep the local bundle, say so, and point at the `setup` guide; never retry with a different token on your own.
- Anything you cannot verify from the codebase stays a bracketed placeholder in PRODUCT.md, never an invention.

## Path B: greenfield (no code yet)

Read `reference/greenfield.md`, `artboard-rules.md` and `canvas-layout.md` first (resources `designli://template/greenfield`, `designli://rules/...`). Three question rounds, then you create the design system yourself; impeccable's `document` is NOT run (its seed mode writes no tokens), it is used later by `review` and by `init --refresh` once code exists.

B1. **Product identity round** (one grouped question, up to 4 parts): what the product is and who it is for (offer "I'll describe it" as the free-text route), register (default `product`), platform (desktop-first web app / mobile-first / both), brand personality in three words (offer three contrasting options). Write `PRODUCT.md` from the template with `## Codebase Conventions` saying greenfield, the intended stack (default "Next.js + Tailwind + shadcn, to be confirmed"), `design/tokens.css` as the token source and `design/components/` as the component source.

B2. **Direction round** (one grouped question): color strategy plus hue anchor, typography direction, motion energy, three named references and one anti-reference (impeccable's five seed questions, options as listed in `greenfield.md`). Then run impeccable's `palette.mjs --from "<product name>"` for a seed hue (the designer's hue anchor wins).

B3. **Directions.** Author three low-fi direction artboards `DirectionA.dc.html`, `DirectionB.dc.html`, `DirectionC.dc.html` in `design/directions/` (each a named axis, same first screen, different systems) plus a minimal `flow.json` (`slug: "directions"`, `title: "<Product> Directions"`, `steps: []`, `order: null`) and `canvas.json` (one row, 1440-wide frames). With the portal target, `portal_push` the directory as the flow `directions` (the portal's Canvas view shows the three side by side; the designer can comment on each); with `local`, `bundle` it and open the three flattened HTML files in the browser. **Third round**: which direction (A, B, C, or mix + one sentence). Record the choice and the URL in `design/library.json` (`direction`, `directionsUrl`).

B4. **Author the system** from the chosen direction, in this order: `DESIGN.md` (frontmatter on line 1 with hex tokens, then the SEED comment line, then the six sections with Named Rules), `.impeccable/design.json` (schemaVersion 2 with 5-10 `ds-` primitives, colorMeta with OKLCH canonical values and 8-step ramps, narrative copied from DESIGN.md), then `tokens_css` to produce `design/tokens.css`. Run `flow_check` with `designOnly: true` and fix every error. Write `design/library.json` with `greenfield: true` as in `greenfield.md`.

B5. **Components sheet**: Step 7 as written, except that every component definition element carries `data-component-def="<Export>[/<variant>]"` and the artboards are built from the design.json snippets and `design/tokens.css` values (literal values in inline styles). Publish and record `componentsUrl`.

B6. **Handover**: `design/README.md`, an agent instructions file for the future codebase (offer, do not force) that tells developers to scaffold from `design/tokens.css` and DESIGN.md and to run `init --refresh` after the first components exist, then `git status --short` and the next command: the `flow` prompt with the product's first flow.

Greenfield failure modes: the designer cannot pick a direction (default to A and record an Open Question in library.json `notes`); the directions cannot be pushed (describe the three directions in one line each and ask); the designer wants dark mode (design light first, record `theme.designedThemes` and note dark as a follow-up).
