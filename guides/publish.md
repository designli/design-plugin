# publish: one release, every flow, nothing overwritten

Tools: `project_status`, `publish` (CLI: `scripts/portal.mjs publish --note "..." [--flows a,b] [--dry-run] [--force]`). One question at most: the release note.

## Step 1: status

`project_status` requiring `setup` and `flows`. Blockers stop here with the fix. Note the flows with `unpublishedChanges` or `neverPublished`, the gap count, and the portal side (`openThreads`, `pendingEdits` per flow).

## Step 2: dry run when unsure

`publish` with `dryRun: true` when the designer asked what would happen, when the portal reports open feedback, or when more than one flow changed. Report per flow: `new`, `changed`, `unchanged`, `behind` (the portal has a newer version than this repository knows), `error` (a broken file or include; fix before publishing). `wouldRefuse` lists flows with unpulled feedback.

## Step 3: the note

Propose a release note from the dry run (which flows changed, how many screens) and the designer's own words; the client reads it on the Releases tab. Ask once if nothing was given. Keep it under a sentence or two.

## Step 4: publish

`publish` with the note (and `flows` when the designer limited the release). It bundles every flow, refuses before pushing anything on `STALE_LOCAL`, pushes the changed flows as versions and the components, records the release, marks the copy edits that were applied locally as applied on the portal, and pulls each pushed flow so the repository mirrors the portal.

Report: the release number and URL, the flows pushed with their version, the unchanged ones, the components state, the remaining gaps, and the client URL to share.

## STALE_LOCAL

The portal has comments, copy edits or structure edits (waivers, step titles, entry points, order) that this repository has not pulled, or a newer version pushed from elsewhere. Never `force` on your own. Say what is unpulled, run the `feedback` guide (pull, digest, apply), then publish again. `force` only when a human said so, and name what it overwrites.

## Failure modes

- `BUNDLE` error: a state maps to a file that does not exist, or an include is missing; list them, fix or ask, publish again.
- `FORBIDDEN`: the token lacks `push`; a Designli admin extends the membership or mints a token with the right scope.
- `BUNDLE_TOO_LARGE` (413): a screen embeds large images; move them to pinned URLs or shrink them.
- The release was recorded but a later step failed (for example the releases cache): say so; nothing is lost on the portal.
