# Pilot: Vital Knowledge, subscribe checkout

Goal: one real flow end to end, from a designer's prompt to an implemented screen, in two weeks. Repo: `new-vk/vital-knowledge-frontend` (Next.js 14, Tailwind 3.4, shadcn new-york, a handful of legacy MUI widgets). Flow: subscribe checkout at `/register` (backup: manage subscription at `/my-account`).

## Day 1 (Gabriel): install and DNA

1. From the frontend repo root, on a branch `chore/design-dna`: `claude --plugin-dir <design-tool>`, then `/designli-design:init`.
   - Expect three question rounds (canonical library, product identity, impeccable's naming round).
   - Expect `PRODUCT.md` (register `product`), `DESIGN.md` with hex tokens including `vk-red #d72b26`, `vk-blue`, `vk-green`, `vk-orange`, the slate-derived `primary`, `radius`, Poppins; `.impeccable/design.json` with at least 8 components; `.claude/skills/impeccable/SKILL.md` at version 3.5.0; a Components canvas link.
   - Known token defects init must record as Don'ts (from the 2026-09-06 scan): `tailwind.config.ts` wraps a hex `--background2` in `hsl()`; `vk-background` and `bg` reference undefined variables; `font-poppins` maps to an unset `--poppins`; the flat `muted-foreground` key collides with `muted.foreground`; `globals.css` defines `--foreground` and `--muted-foreground` twice. `components.json` points at `tailwind.config.js` / `src/index.css` and says zinc while the values are slate.
2. Decide on the optional `components.json` path fix and on creating a frontend-repo `CLAUDE.md` (there is none inside the git repo today).
3. Open the PR for the DNA files. File the tailwind token defects as a separate dev ticket.

## Day 2 (Gabriel + designer): 30-minute walkthrough

Open the Components canvas, click an element, change its text, Save. Confirm the canvas saves (if the org does not allow saving, the canvas is view-only and the review loop runs through comments and re-seeds). Hand over the cheat sheet below.

## Days 3-5 (designer): design, review, hand off

- `/designli-design:flow "subscribe checkout: choose plan, account, payment, done"` (desktop, static). Expect two question rounds and a canvas with a flow map, 14-16 state artboards and a Components page.
- Ask a PM or Gabriel to comment on the canvas using the artboard-name convention, and to change one thing directly in the canvas and Save.
- `/designli-design:review subscribe-checkout`: expect the canvas edit to be picked up, the drift (if a non-token color was picked) flagged, a critique snapshot with a score, one change list, a republish, replies on the threads.
- `/designli-design:handoff subscribe-checkout "Subscribe checkout"`: expect a clean strict gate and `specs/Subscribe checkout/` with `design-flow.md` and flattened HTML. Commit on a branch and open a PR.

## Days 6-9 (developer + Gabriel): implement and compare

- `/refine-us` -> `/us-to-tus` -> `/us-to-specs` -> `/implement-specs-nextjs "./specs/Subscribe checkout/implementation-order.md"` on a branch. Until the designli-skills references PR is merged, tell the implementing agent where the references live (`specs/Subscribe checkout/design/`). Needs the dev API `.env`; the plugin never reads or copies it.
- With the Playwright MCP, screenshot `/register` in each reproducible state (default; validation via empty submit; Stripe error with test card `4000 0000 0000 0002`; submitting and loading by throttling `/setup-intent`) at 1440 and 390. Add them to a QA page with `/designli-design:flow --extend subscribe-checkout` and let the designer comment. Stripe's PaymentElement is an iframe; the artboards show a labelled placeholder.
- Grep the implementation for every `data-component` target listed under Components Used; no new `@mui` imports.

## Day 10: retro

Adoption verdict from the designer; DESIGN.md corrections; decide whether to open the designli-skills PR (`feat/design-references`) and whether to enable `iterate`.

## Done means

- Plugin validates and installs with zero errors.
- All four verbs complete on Vital Knowledge within the question budgets, with no manual file edits by the designer.
- Every required state exists as an artboard; `flow-check --strict` is clean; a critique snapshot exists with a score.
- `implement-specs-nextjs` consumes `design-flow.md` without a Figma URL and produces the loading, validation, error and success states for `/register`.
- The designer's screenshot review yields no P0 and at most 3 P1 findings traceable to spec ambiguity.
- `init --refresh` after implementation reports no new drift on the handed-off flow.

## Cheat sheet for the designer

- You describe, it drafts. Say what the person is trying to do, where they start, and what "done" looks like. Example: "subscribe checkout: choose a plan, create the account, pay, land logged in".
- It asks at most two things before showing you a canvas. If you do not know, pick the recommended option; it is written down as an open question.
- Small tweaks: click the element on the canvas, change it, press Save.
- Bigger changes: leave a comment starting with the artboard name, for example `02-Account-Error: the message should sit under the field, not as a toast`. Then run `/designli-design:review subscribe-checkout`.
- Every step needs its states (loading, error, empty, ...). You can skip one only with a reason; the handoff refuses otherwise. That is on purpose: developers build what is drawn.
- When you are happy: `/designli-design:handoff subscribe-checkout "Subscribe checkout"`. Developers take it from there.
- Brand and marketing work stays in Figma. This tool is for product flows.

---

# Pilot variant: greenfield MVP (no code yet)

Project: `/Users/gabriel/Develop/Designli/design-pilot-mvp` (empty git repo). The plugin's preflight detects no UI source and `init` takes the greenfield path: it creates the design system from a direction instead of reading code.

1. `cd /Users/gabriel/Develop/Designli/design-pilot-mvp && claude`, accept the trust dialog, run `/designli-design:init`.
   - Expect three question rounds: product identity, direction (color strategy, type direction, motion, references), and the pick between three direction artboards on a "Directions" canvas.
   - Expect: `PRODUCT.md`, `DESIGN.md` with a full hex-token frontmatter and a SEED comment at the top, `.impeccable/design.json` with 5-10 `ds-` primitives, `design/tokens.css`, `design/directions/` (three artboards + canvas), `design/components/` (Components sheet + canvas link), `design/library.json` with `greenfield: true`, `.claude/skills/impeccable/` at 3.5.0.
2. `/designli-design:flow "<the MVP's first flow>"` (for example "sign up and create the first project"). Entry points are asked, not read from code. Component references point at the Components sheet.
3. Comment on the canvas, `/designli-design:review <slug>`, then `/designli-design:handoff <slug> "<story title>"`. The handoff tells developers to scaffold from `design/tokens.css` and DESIGN.md first.
4. Later, once a codebase exists: `/designli-design:init --refresh` re-documents from code and flows migrate their component references.

Done for the greenfield pilot: all four verbs complete within the question budgets; `flow-check --strict` clean; a developer (or agent) can scaffold the app from `design/tokens.css` and build the flow from `specs/<story>/` without asking the designer anything that is already in the spec.
