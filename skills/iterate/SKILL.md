---
name: iterate
description: Phase 2, not part of the pilot. After a flow has been implemented, tune it visually on the running app with impeccable's live mode, then bring the design DNA and the flow's artboards back in line with what shipped. Requires the dev server running.
argument-hint: "<flow-slug> [route]"
disable-model-invocation: true
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node .claude/skills/impeccable/scripts/*), Bash(IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/*), Bash(git status *), Bash(git diff *)
---

# iterate: live tuning on the real app (phase 2)

Not enabled for the pilot. If invoked during the pilot, say so and offer `/designli-design:review <slug>` instead.

When enabled:

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs" --require impeccable,dna --json`; confirm the dev server answers on the project's dev URL (default `http://localhost:3000`) and port 8400 is free. Stop with `pnpm dev` if not.
2. Ensure `.impeccable/live/config.json` exists (init writes it; it must target the real root layout, for a Next.js App Router that is `src/app/layout.tsx`). Run `node .claude/skills/impeccable/scripts/detect-csp.mjs` once; if it proposes a config patch, show it and ask before applying.
3. Invoke the Skill tool with skill `impeccable` and args `live <route>` and follow it. Live mode injects a script tag into the root layout between markers; it must be removed at the end (`stop`).
4. Before finishing: `git diff --name-only` must not include the root layout with a `localhost:8400` tag; if it does, run the removal (`node .claude/skills/impeccable/scripts/live-inject.mjs --remove`) and re-check.
5. If tokens or components changed in the session: `/designli-design:init --refresh`, then `/designli-design:flow --extend <slug>` to re-check the flow's artboards against the refreshed tokens.
