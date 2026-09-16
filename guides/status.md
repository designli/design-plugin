# status: one screen, then the next command

Tool: `project_status` (CLI: `scripts/preflight.mjs --hashes`, `scripts/portal.mjs status`). No questions.

Call `project_status` and render one screen in plain words:

1. **Connection**: portal URL, project, token source (env or credentials file), git remote. Blockers first, each with its fix.
2. **Flows**: per flow, its order in the journey, steps and screens, devices, published version, whether it has unpublished changes (or was never published), the last pull time. From the portal side: open threads, pending copy edits, missing states as the portal counts them.
3. **Gaps**: the total by kind (missing states, unassigned files, broken links or includes, no entry points, no order, no product). Point at `gaps` for the list.
4. **Last release**: number, note, when.
5. **Next**: the `nextSteps` the tool returns, verbatim in the harness's spelling. Typical: `setup` when not connected; `adopt` when nothing is declared (or `adopt --from-portal` when the portal has flows this repository lacks); `feedback` when the portal has open threads or pending edits; `publish` when a flow changed; `handoff` when everything is published and reviewed.

Do not run anything else from here.
