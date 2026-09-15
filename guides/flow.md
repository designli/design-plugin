# flow: a user path with all its states, reviewed on the portal

Plain words only; no tool vocabulary. Two question rounds at most before the designer sees the flow on the portal. Every question is one grouped question with prefilled options and a recommended default; "I don't know" picks the default and lands in Open Questions.

Tools: the `designli-design` MCP server (`project_status`, `flow_check`, `bundle`, `portal_head`, `portal_pull`, `portal_push`) or the equivalent scripts under the plugin's `scripts/` directory. Read once per session: `reference/artboard-rules.md`, `canvas-layout.md`, `states-checklist.md`, `design-flow.template.md` (resources `designli://rules/...` and `designli://template/design-flow`).

## Step 0: status

Call `project_status` and require impeccable, design DNA and the library (CLI: `preflight.mjs --require impeccable,dna,library --json`). On a blocker, say what is missing and point at the `init` guide (or `setup` when the repo is not connected). Load `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `design/library.json`.

`--extend <slug>`: load `design/flows/<slug>/flow.json`; if it has been pushed (`portal.version`), run `portal_pull` first so no feedback is lost, fold pending copy edits in, then continue from Step 3 with the new steps or states only.

## Step 1: ground the brief in the code

**Greenfield** (`design/library.json.greenfield` is true): there are no routes or schemas to read. Ground the flow in `PRODUCT.md`, the chosen direction, `DESIGN.md` and the brief instead: invent realistic field names, validation messages and sample data consistent with the product, and ask the designer for the entry points in round 1. Component references point at the Components sheet (`data-component="design/components/CmpButtons.dc.html#Button/primary"`) because no code paths exist yet.

Otherwise find the closest existing surface: routes under `src/app`, the components they render, validation schemas (yup/zod), API hooks and services, toast strings, existing loading and error handling, prices or plans, feature flags. Write the **flow facts** for yourself: real field names and validation messages, real copy, real data keys, what happens today on failure, entry points into this surface. If nothing matches, treat it as a new surface and say so; the designer must then name the entry route.

## Step 2: question round 1 (path and framing)

One grouped question:

- Steps: the ordered list you derived (each with kind: form, data, choice, confirmation, result, info) with entry points; offer "as proposed", "fewer steps", "more steps" and let them correct in free text.
- Place in the journey (only when `design/flows/` already holds other flows): where this flow sits in the product's order (propose the next free number) and which existing flows it leads to, with the trigger ("after the invoice is sent → `get-paid`"). Offer "last, no connections" as the default.
- Device: desktop 1440x900 (default), mobile 390x844, both. `--device` skips this.
- Static mockups (default) or clickable prototype. `--prototype` skips this.

## Step 3: question round 2 (states)

One question showing the states matrix: for each step, the required states from `states-checklist.md` pre-checked, optional ones unchecked. A required state may be dropped only with a reason; record it as `n/a: <reason>`. If the designer says "just the happy path", keep the required states anyway and explain in one sentence why developers need them; they can still waive individual ones with a reason.

Write `design/flows/<slug>/flow.json`:

```json
{
  "schema": 1,
  "slug": "<slug>",
  "title": "<Title>",
  "goal": "<one sentence>",
  "device": "desktop",
  "frame": { "w": 1440, "h": 900 },
  "prototype": false,
  "status": "draft",
  "story": null,
  "order": 1,
  "next": [{ "flow": "<sibling slug>", "on": "<trigger>" }],
  "entryPoints": [{ "from": "<where>", "to": "01-<StepId>" }],
  "steps": [
    {
      "n": "01",
      "id": "<StepId>",
      "kind": "form",
      "surface": "<route>",
      "states": { "Default": "01-<StepId>-Default.dc.html", "Empty": "n/a: <reason>" }
    }
  ],
  "transitions": [
    { "from": "01-<StepId>-Default", "on": "<trigger>", "to": "02-<StepId>-Default" }
  ],
  "reviews": []
}
```

Slug: kebab-case from the title. StepId: PascalCase. State names: the fixed vocabulary. `order` is the flow's place in the product journey (1 = first) and `next` lists the flows it leads to; the portal draws its journey map from them and `flow_check` refuses a `next` slug that is not a sibling under `design/flows/`. Leave `next` empty when nothing follows. The `portal` block is written by the push; never write it by hand.

## Step 4: author the artboards

One file per step-state, `NN-StepId-State.dc.html`, following `artboard-rules.md` strictly: values lifted from DESIGN.md, design.json and the real component source; literal copy; inline styles; `data-component` and `data-token` on everything that maps to code; chrome only through `<dc-import name="CmpNavbar" hint-size="100%,88px"></dc-import>` and friends from `design/components/`; inline SVG icons; realistic sample data; third-party iframes (payment elements) as labelled placeholder boxes with `data-external`. Each state shows exactly what `states-checklist.md` says it must show.

`Main.dc.html` is the flow map: one box per step, arrows labelled with triggers, a legend, and the printed comment convention ("Comment with the artboard name first, e.g. `02-Account-Error: ...`").

For flows with more than four screen states you may fan out: if your harness can run parallel workers, give each one step (the step's facts, the DESIGN.md path, the components directory and the rules file) and have them write the files; in Claude Code the plugin ships an `artboard-author` agent for this. Review every file they write against the rules before continuing. Otherwise author inline.

## Step 5: layout and checks

Write `design/flows/<slug>/canvas.json` per `canvas-layout.md`: one row per step in fixed column order, 120 px gaps, `Main` above row 01. The portal's Canvas view uses these positions.

Run `flow_check` on `design/flows/<slug>` (CLI: `flow-check.mjs --flow design/flows/<slug>`). Fix every error and every drift warning you can (an unknown color means you invented a value: replace it with the token). Rerun until clean.

## Step 6: the flow spec draft

Write `design/flows/<slug>/design-flow.md` from `design-flow.template.md`: every section filled from the flow facts and the artboards; verbatim copy; the States Coverage table with `[x]` or `n/a: reason` per cell; Open Questions for every default you picked on the designer's behalf.

## Step 7: bundle and publish

Always build the bundle first: `bundle` with `flow: "design/flows/<slug>"` (CLI: `bundle.mjs --flow design/flows/<slug> --components design/components --json`); screens are flattened to static HTML plus `manifest.json`, and interactive screens render their Default state. Then publish per `design/library.json.publish.target` (a per-flow `flow.json.publish.target` overrides it):

- **portal** (the default): if the flow already exists on the portal (`portal_head` says `exists: true`), run `portal_pull` first so no customer feedback is lost, and fold anything pending into this round before pushing. Then `portal_push` with a `note` saying what changed. On `stale: true`, pull, review, and push again; never pass `force` on the designer's behalf. Show the returned URL.
- **local**: nothing else; the handover names `design/flows/<slug>/bundle/` and the portal can be pointed at it later.

## Step 8: handover

Show the link (portal URL, or the bundle path). Two sentences: what you assumed, what is placeholder. Then: "Review it on the portal: click through the prototype, comment on any screen, or switch to Edit copy and change a text in place. Ask a Designli admin to invite the customer to the project (Admin → Projects → Invite a client); they set a password from the invite link and see only that project. When there is feedback, run the `review` prompt for this flow. When it is ready for developers: the `handoff` prompt with the story title." If your harness can run a background worker, have it re-read the artboards against the rules and the brief and report problems (never the bundle output).

## Failure modes

- The push is refused (no token, no `push` permission, stale head): say exactly what the portal answered and what to do (setup, ask an admin, pull first). Never retry with `force` or another token on your own.
- The designer cannot answer: default plus an Open Question. Never block.
