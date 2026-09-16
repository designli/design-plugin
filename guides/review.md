# review: an optional critique of the bundled screens

Plain words only. One question round (the change list). Tools: `bundle`, `gaps`; the impeccable references served as resources (`designli://impeccable/critique`, `designli://impeccable/harden`, `designli://impeccable/clarify`). The project may have impeccable installed under `.claude/skills/impeccable` (the plugin pins 3.5.0); when it is, run its `critique` command there; when it is not, apply the reference checklists by hand.

This guide does not pull or publish; it produces a change list the designer applies with their own tools, then `publish`.

## Step 1: a stable target

`bundle` for the flow: the flattened screens under `design/flows/<slug>/bundle/screens/` are complete documents with includes inlined, the right target for a critique (never the sources with `<dc-import>` holes).

## Step 2: critique and checklists

1. Run impeccable's `critique` on the densest `Default` screen (register product, scope to this flow, do not run init). It writes a snapshot with a score and P0/P1/P2 findings.
2. Apply the `harden` and `clarify` checklists to the states and the copy: empty and error states, long content, double submit, unauthenticated or already-done cases, button labels as verb + object, error messages that say what to do.
3. `gaps` for the flow: missing states and structural problems belong on the same list.

`--critique-only` skips 2 and 3.

## Step 3: the change list (one question)

One numbered list grouped by source: critique P0 and P1, hardening gaps, copy, structural gaps. Each item names the screen file and the concrete change. Ask once: apply all / pick numbers / skip. `--apply-all` applies everything without asking. Items you will not recommend (out of scope, contradicts the product's design system) are listed with a one-line reason, not silently dropped.

## Step 4: hand back

The designer (or their agent) applies the chosen items to the source files. Then `publish` with a note naming what changed. Append `{ at, critique: { score, snapshot }, applied: [...], skipped: [...] }` to `flow.json.reviews`.

## Failure modes

- impeccable not installed and the designer wants the scored critique: `node <plugin>/scripts/install-impeccable.mjs --project .` installs the pinned build; otherwise the checklists still apply.
- No findings: say so; do not invent items.
