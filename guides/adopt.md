# adopt: declare the prototype's flows, steps and states

Plain words with the designer; the vocabulary of files, steps and states is theirs, the tools are not. One grouped question per flow at most, listing only what the scan could not settle, every question with a proposal and a recommended default; "I don't know" picks the default and lands in the flow's open questions (a `state-missing` gap or a `?` entry point the next `adopt` asks about again).

Tools: `project_status`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `adopt_from_portal` (CLI: `scripts/adopt.mjs scan | propose | write --file | from-portal`).

## Step 0: status

Call `project_status`. `SETUP` or `PORTAL_TOKEN` blockers: stop and point at the `setup` guide. If the repository declares no flows and the portal has some, or the designer passed `--from-portal`, go to Step 5.

## Step 1: scan and propose

`prototype_scan` (with the folder the designer named, default `design/`), then `flows_propose`. The proposal is pure inference: one flow per folder, steps and states from file names, transitions from links, entry points from files nothing links to, kinds from the markup. Nothing is written yet. Screens already declared by a flow are not proposed again: re-running `adopt` only asks about new files.

`flows_propose` returns `questions` only for what it is unsure about (each carries `confidence: guess|unknown`); everything else is on the proposal with `confidence.title`, `confidence.entryPoints` and `confidence.steps.NN` (`sure|guess`).

If `unassigned` is empty and there are no questions, say the prototype is fully declared, run `gaps`, and stop with the next command (`publish`).

## Step 2: product basics, once

If the scan reports no product (`product: null`), ask once for the product name and a one-line summary (audience optional). Written into `design/prototype.json.product` by `flows_write`; shown on the portal's project page and in every handoff.

## Step 3: one grouped question per proposed flow

Show, per flow, one short summary: the title (from the screens or the folder), the steps with kind and states, marking anything with `guess` as "(guess)"; then ask only the items in `questions` for that flow (goal; missing required states; the entry point when `?` had no unique candidate; the folder). End with one line: "Anything to correct in the summary?"

Do not ask about a title, a kind or an entry point the proposal marked `sure`. Do not ask about transitions: they come from links, and the designer can edit `flow.json` later.

## Step 4: write and check

`flows_write` with the answered flows and the prototype block (devices, components dir, product). It merges over existing `flow.json` files and validates names (two-digit `n`, PascalCase step id, the states vocabulary, a known kind). Then `gaps`: list what remains in plain words (a missing state per step, an unassigned file, a broken link or include), each with what to do. Gaps do not block `publish`; they show on the portal as such.

Finish with: "Published nothing yet. Next: `publish` with a note for the client" (or the harness's spelling of it).

## Step 5: from the portal

`adopt_from_portal` rebuilds `design/prototype.json` and every `design/flows/<slug>/flow.json` from the latest version on the portal: steps, states, waivers, entry points, order, transitions, and the sync state. Files the repository has keep their names; a screen whose source is missing is downloaded flattened (includes inlined) and named by its id, and the result says so. Then it pulls feedback. After it, `publish --dry-run` on an unchanged prototype must report every flow as unchanged; if it does not, say what differs.

## Failure modes

- No HTML found: point at the `prototype` guide; nothing to adopt yet.
- A file name the scan cannot read (no state token): it is proposed as `Default` of a step named after the file; the designer corrects it in the question round.
- Two files map to the same step and state on the same device: report the duplicate; the designer picks one or renames.
- Kite-style `.dc.html` artboards with an existing `flow.json`: nothing to do; `adopt` reports the prototype as fully declared.
- A step whose kind is `(guess)` and wrong: the designer corrects it in the "anything to correct" line; `flows_write` takes the corrected `kind`.
- A screen above 4 MB: it is declared in `flow.json` and reported as `too-large` with its size; the portal shows the state as "unavailable" and it cannot be waived. Trim the inline asset or link it by URL, then publish.
