---
name: handoff
description: Package a reviewed flow for developers. Verifies states coverage and design-system drift, writes ./specs/<user story title>/design-flow.md plus flattened HTML references per screen state, and points the developer at the designli-skills pipeline (refine-us, us-to-tus, us-to-specs, implement-specs-nextjs).
argument-hint: "<flow-slug> \"<user story title>\" [--force] [--allow-local]"
disable-model-invocation: true
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/flow-check.mjs*), Bash(node *scripts/dc-to-html.mjs*), Bash(node *scripts/bundle.mjs*), Bash(node *scripts/portal.mjs*), Bash(git status *), Bash(ls *)
---

# handoff: the flow becomes a spec the dev pipeline consumes

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Run the plugin scripts as given; do not open or read them (they live outside the project and reading them only costs turns).

Never wrap the script path in extra quotes beyond what is shown. Flow dir: `design/flows/<slug>`. Story dir: `./specs/<user story title>/` (the same folder `us-to-specs` uses; spaces in the title are fine).

## Step 1: gate

`node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs" --require impeccable,dna,library --json`, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow-check.mjs" --flow design/flows/<slug> --strict` (add `--allow-local` only when the designer passed it: it permits a canvas that was never published). Strict mode blocks on: any coverage cell that is `[ ]` or an `n/a` without a reason, any color or font not in DESIGN.md, a `data-component` path or export that does not exist, a missing `# ...` section in `design-flow.md`, a stale or missing bundle, and missing publish evidence for the target (a portal version, or a canvas url).

If it fails: list each gap with the artboard to add or the value to replace, and stop. Write nothing.

Warn (do not block) when the last review log lists open comment threads, and when a legacy `.specs/` folder exists (the pipeline is being aligned on `./specs/`).

## Step 2: the story title

If the title was not passed, ask once (AskUserQuestion) with the flow title as the default. If `./specs/<title>/design-flow.md` already exists and differs, show a diff summary and ask before overwriting (`--force` skips the question).

## Step 3: write the handoff

1. `mkdir -p "./specs/<title>/design"`.
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/dc-to-html.mjs" --flow design/flows/<slug> --components design/components --out "./specs/<title>/design" --force`. This writes `Main.html` and `NN-StepId-State.html`, plain static HTML with inline styles, chrome inlined, a banner pointing back to the source artboard.
3. Copy `design/flows/<slug>/design-flow.md` to `./specs/<title>/design-flow.md`, rewriting artboard paths to `design/<stem>.html`, filling `# Design References` (canvas url + version, sources path `design/flows/<slug>/`, components sheet url) and setting `Status: handed-off`.
4. Copy any exported PNGs the designer placed in `design/flows/<slug>/png/` to `./specs/<title>/design/png/`. Copy `design/flows/<slug>/bundle/` to `./specs/<title>/design/bundle/` (manifest plus the same static screens, for tools).
   With the portal target, pull once more first (`portal.mjs pull`) so `design-flow.md`'s Review log and Open Questions reflect the final customer feedback, and record the portal URL and version under `# Design References` (`- Portal: <url> (v<n>)`).
5. Do NOT create or edit `./specs/<title>.md` (the technical user story) or `./specs/<title>/implementation-order.md`; those belong to the pipeline.
6. Set `flow.json.status = "handed-off"` and `flow.json.story = "<title>"`.

## Step 4: tell the developer what to do

**Greenfield**: also print that no code exists yet; the implementing agent must scaffold the app (intended stack in `PRODUCT.md` Codebase Conventions) from `design/tokens.css` and `DESIGN.md` before building the flow, and the team should run `/designli-design:init --refresh` once the first real components exist so references migrate from the Components sheet to code paths.

Print, verbatim for pasting into the user story if it predates the flow:

```
Design: ./specs/<title>/design-flow.md (portal <url> v<n>, or canvas <url>). Screen references: ./specs/<title>/design/*.html
```

Then the pipeline: `/refine-us` (it should read the flow spec and skip the UI questions it already answers), `/us-to-tus`, `/us-to-specs`, `/implement-specs-nextjs "./specs/<title>/implementation-order.md"`. Until the designli-skills references PR is merged, add: "tell the implementing agent that design references are under ./specs/<title>/design/ and that inline styles there are exact values mapped to DESIGN.md tokens".

Finish with `git status --short specs design` and a suggested commit message.
