---
name: flow
description: Design a multi-screen user flow (steps, states, transitions) for this product as a visual canvas the designer can tweak and comment on. Use when a designer describes a journey to design ("checkout", "cancel subscription", "reset password", "onboarding") or asks to add screens or states to an existing flow.
argument-hint: "\"<flow name or brief>\" [--extend <flow-slug>] [--device desktop|mobile|both] [--prototype]"
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/flow-check.mjs*), Bash(node *scripts/seed-flow.mjs*), Bash(node .claude/skills/impeccable/scripts/*), Bash(IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/*), Bash(git status *)
---

# flow: a user path with all its states, on a canvas

Plain words only; no tool vocabulary. Two question rounds at most before the designer sees a canvas. Every question has prefilled options and a recommended default; "I don't know" picks the default and lands in Open Questions.

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Run the plugin scripts as given; do not open or read them (they live outside the project and reading them only costs turns).

Never wrap the script path in extra quotes beyond what is shown. Read once per session: `${CLAUDE_PLUGIN_ROOT}/reference/artboard-rules.md`, `canvas-layout.md`, `states-checklist.md`, `design-flow.template.md`.

## Step 0: preflight

`node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs" --require impeccable,dna,library --json`. On a blocker, say what is missing and point at `/designli-design:init`. Load `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `design/library.json`.

`--extend <slug>`: load `design/flows/<slug>/flow.json`; if `artifact.url` is set, read the artifact with the Artifact tool and, when its version differs from `flow.json.artifact.version`, sync first exactly as the `review` skill's step 1 does (comments before extract). Then continue from Step 3 with the new steps or states only.

## Step 1: ground the brief in the code

**Greenfield** (`design/library.json.greenfield` is true): there are no routes or schemas to read. Ground the flow in `PRODUCT.md`, the chosen direction, `DESIGN.md` and the brief instead: invent realistic field names, validation messages and sample data consistent with the product, and ask the designer for the entry points in round 1. Component references point at the Components sheet (`data-component="design/components/CmpButtons.dc.html#Button/primary"`) because no code paths exist yet.

Find the closest existing surface: routes under `src/app`, the components they render, validation schemas (yup/zod), API hooks and services, toast strings, existing loading and error handling, prices or plans, feature flags. Write the **flow facts** for yourself: real field names and validation messages, real copy, real data keys, what happens today on failure, entry points into this surface. If nothing matches, treat it as a new surface and say so; the designer must then name the entry route.

## Step 2: question round 1 (path and framing)

One grouped AskUserQuestion:
- Steps: the ordered list you derived (each with kind: form, data, choice, confirmation, result, info) with entry points; offer "as proposed", "fewer steps", "more steps" and let them correct in free text.
- Device: desktop 1440x900 (default), mobile 390x844, both. `--device` skips this.
- Static mockups (default) or clickable prototype. `--prototype` skips this.

## Step 3: question round 2 (states)

One AskUserQuestion showing the states matrix: for each step, the required states from `states-checklist.md` pre-checked, optional ones unchecked. A required state may be dropped only with a reason; record it as `n/a: <reason>`. If the designer says "just the happy path", keep the required states anyway and explain in one sentence why developers need them; they can still waive individual ones with a reason.

Write `design/flows/<slug>/flow.json`:

```json
{ "schema": 1, "slug": "<slug>", "title": "<Title>", "goal": "<one sentence>",
  "device": "desktop", "frame": { "w": 1440, "h": 900 }, "prototype": false,
  "status": "draft", "story": null,
  "entryPoints": [ { "from": "<where>", "to": "01-<StepId>" } ],
  "steps": [ { "n": "01", "id": "<StepId>", "kind": "form", "surface": "<route>",
               "states": { "Default": "01-<StepId>-Default.dc.html", "Empty": "n/a: <reason>" } } ],
  "transitions": [ { "from": "01-<StepId>-Default", "on": "<trigger>", "to": "02-<StepId>-Default" } ],
  "artifact": { "url": null, "version": null, "publishedAt": null }, "reviews": [] }
```

Slug: kebab-case from the title. StepId: PascalCase. State names: the fixed vocabulary.

## Step 4: author the artboards

One file per step-state, `NN-StepId-State.dc.html`, following `artboard-rules.md` strictly: values lifted from DESIGN.md, design.json and the real component source; literal copy; inline styles; `data-component` and `data-token` on everything that maps to code; chrome only through `<dc-import name="CmpNavbar" hint-size="100%,88px"></dc-import>` and friends from `design/components/`; inline SVG icons; realistic sample data; third-party iframes (payment elements) as labelled placeholder boxes with `data-external`. Each state shows exactly what `states-checklist.md` says it must show.

`Main.dc.html` is the flow map: one box per step, arrows labelled with triggers, a legend, and the printed comment convention ("Comment with the artboard name first, e.g. `02-Account-Error: ...`").

For flows with more than four screen states you may fan out: launch `artboard-author` agents (one per step) with the step's facts, the DESIGN.md path, the components directory and the rules file, and have them write the files. Review every file they write against the rules before continuing. If the agent is unavailable, author inline.

## Step 5: canvas layout and checks

Write `design/flows/<slug>/canvas.json` per `canvas-layout.md`: pages Flow and Components, one row per step in fixed column order, 120 px gaps, `Main` above row 01, one sticky note per step and per transition, a how-to note, `launch` on the Flow page.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow-check.mjs" --flow design/flows/<slug>`. Fix every error and every drift warning you can (an unknown color means you invented a value: replace it with the token). Rerun until clean.

## Step 6: the flow spec draft

Write `design/flows/<slug>/design-flow.md` from `design-flow.template.md`: every section filled from the flow facts and the artboards; verbatim copy; the States Coverage table with `[x]` or `n/a: reason` per cell; Open Questions for every default you picked on the designer's behalf.

## Step 7: seed and publish

Once per session, invoke the Skill tool with skill `design` and no arguments, purely to learn its base directory: note the "Base directory for this skill" line it prints; do not ask the designer what to design and do not start a brief. Then run:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/seed-flow.mjs" --skill-dir "<base dir>" --flow design/flows/<slug> --components design/components --title "<Product> <Flow title>" --out design/flows/<slug>/<slug>.html`

Publish `design/flows/<slug>/<slug>.html` with the Artifact tool exactly as the design skill's step 4 prescribes (contract pin, capabilities from the roster, favicon, description). Record `artifact.url`, `artifact.version` (from the publish result) and `publishedAt` in `flow.json`. On `--extend`, republish to the same path with the same favicon and no capabilities.

## Step 8: handover

Show the link. Two sentences: what you assumed, what is placeholder. Then: "Comment on the canvas using the artboard name, then run `/designli-design:review <slug>`. When it is ready for developers: `/designli-design:handoff <slug> "<story title>"`." Run the design skill's background second look over the working files (never the seeded output).

## Failure modes

- Design skill unavailable in this Claude Code build: stop; do not improvise a canvas.
- Publish declined: keep the local file, set `artifact.url` to null, say it is local-only (it opens in a browser as a view-and-export canvas).
- Seed check fails: fix names or JSON, never edit the seeded output.
- The designer cannot answer: default plus an Open Question. Never block.
