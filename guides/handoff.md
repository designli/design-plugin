# handoff: the portal writes the spec, dev agents read it there

Tools: `gaps`, `handoff` (CLI: `scripts/gaps.mjs --flow <slug> --strict`, `scripts/portal.mjs handoff --flow <slug> --story "..."`). Nothing is written into the repository except the flow's status.

## Step 1: gate

`gaps` with `strict: true` for the flow. Blocking: a required state neither designed nor waived, a waiver without a reason, a broken file or include, a bad name. List each with what to do and stop; the client-facing gap list on the portal says the same.

If the flow has changes the portal has not seen (`project_status` reports `unpublishedChanges` or `neverPublished`), run the `publish` guide first: the handoff is taken at the current release.

## Step 2: the story title and the components

Ask once for the user story title if it was not passed (default: the flow title). Components: the flow's includes are listed automatically; ask once whether other shared parts or design-system components the flow relies on should be named (default: none).

## Step 3: hand off

`handoff` with the slug, story and components. The portal generates the spec from the latest version, the structure and the feedback: steps, the states grid with waivers and reasons, transitions and decisions, verbatim copy from the screens, components used, edge cases from resolved threads and applied edits, open questions, screen URLs. It stores it so it never changes under the dev team's feet, and returns the handoff id, its page URL and the `spec.md` URL.

## Step 4: tell the developer

Print, for pasting into the user story:

```
Design handoff: <handoff url> (release <n>, <flow> v<version>). Spec: <spec.md url>.
Dev agents: portal MCP → get_handoff { project, flow } (the "For dev agents" page of the portal docs).
```

The developer's agent needs only the portal MCP server and a token with `view` on the project; it reads the spec, the states grid and the screens, and comments on the flow where the spec is ambiguous.

## Failure modes

- `VALIDATION` with `missing`: the portal found required states neither designed nor waived (someone changed a waiver since the gate); show them and stop.
- `VALIDATION` "publish first": the portal's latest version is not the current screens.
- `FORBIDDEN`: the token lacks `push` (handoffs need it).
