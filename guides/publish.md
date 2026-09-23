# publish: one release, every flow, nothing overwritten

Tools: `project_status`, `publish`, `flows_archive` (CLI: `scripts/portal.mjs publish --note "..." [--flows a,b] [--dry-run] [--force]`, `scripts/portal.mjs archive --flow <slug> [--undo]`). One question at most: the release note (plus, when they apply, one yes/no per `portalOnly` flow and per `orphaning` screen).

## Step 1: status

`project_status` requiring `setup` and `flows`. Blockers stop here with the fix. Note the flows with `unpublishedChanges` or `neverPublished`, the gap count, and the portal side (`openThreads`, `pendingEdits` per flow).

## Step 2: dry run when unsure

`publish` with `dryRun: true` when the designer asked what would happen, when the portal reports open feedback, or when more than one flow changed. Report per flow: `new`, `changed`, `unchanged`, `behind` (the portal has a newer version than this repository knows), `error` (a broken file or include; fix before publishing). `wouldRefuse` lists flows with unpulled feedback. `portalOnly`: flows on the portal that are not in the repository (deleted or renamed locally). `orphaning`: screens this release removes that still have open threads. `wouldNoop`: no flow changed (components are checked at publish time).

## Step 3: the note

Propose a release note from the dry run (which flows changed, how many screens) and the designer's own words; the client reads it on the Releases tab. Ask once if nothing was given. Keep it under a sentence or two.

## Step 4: publish

`publish` with the note (and `flows` when the designer limited the release). It bundles every flow, refuses before pushing anything on `STALE_LOCAL`, pushes the changed flows as versions and the components, records the release, marks the copy edits that were applied locally as applied on the portal, and pulls each pushed flow so the repository mirrors the portal.

Report: the release number and URL, the flows pushed with their version, the unchanged ones, the components state, the remaining gaps, and the client URL to share.

If the result is `noop: true`, say "nothing changed since release N" and stop; do not publish again with a note to force a release. For each `portalOnly` flow ask once: "`promo-codes` is on the portal but not in the repository: archive it?" and call `flows_archive` only on a yes; never archive on your own. For each `orphaning` entry say which screen goes and how many open threads it carries, and offer to resolve them with a note (`portal_reply` then `portal_resolve`); never resolve them yourself. Mention the release `summary` when present (e.g. "19 flows changed only because Footer changed").

## STALE_LOCAL

The portal has comments, copy edits or structure edits (waivers, step titles, entry points, order) that this repository has not pulled, or a newer version pushed from elsewhere. Never `force` on your own. Say what is unpulled, run the `feedback` guide (pull, digest, apply), then publish again. `force` only when a human said so, and name what it overwrites.

## Failure modes

- `RELEASE_UNCHANGED`: the portal already has this snapshot; nothing to record. Only `force` records an identical release, and only when a human asked.
- `BUNDLE` error: a state maps to a file that does not exist, or an include is missing; list them, fix or ask, publish again.
- `FORBIDDEN`: the token lacks `push`; a Designli admin extends the membership or mints a token with the right scope.
- `BUNDLE_TOO_LARGE` (413): a screen embeds large images; move them to pinned URLs or shrink them.
- The release was recorded but a later step failed (for example the releases cache): say so; nothing is lost on the portal.
