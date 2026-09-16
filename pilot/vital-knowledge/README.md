# Pilot: one real designer prototype, end to end

Goal: a designer's own prototype (built with their tools, as static HTML) adopted, published, reviewed by the client and handed off, in one week. The Kite invoicing prototype (`design-pilot-mvp`) is the rehearsal.

## Day 1: connect and adopt

1. From the prototype repo root (a git remote must exist): `claude --plugin-dir <design-tool>`, then `/designli-design:setup`. Expect: portal URL, token typed with the echo off, the project picked from the list, `.mcp.json` and `design/library.json` written.
2. `/designli-design:adopt`. Expect: one grouped question per flow (title and goal, steps with kinds, missing states to design or waive, entry points, order), then `flow.json` per flow and `design/prototype.json`, and the gap list.
3. `/designli-design:publish "first cut"`. Expect: release 1 on the portal, the client URL. Invite the client from Admin → Projects.

## Days 2 to 5: rounds

- The client comments and edits copy on the portal (Prototype view, Edit copy).
- `/designli-design:feedback`: the digest grouped by flow, screen and state, each item with the source file; copy edits already applied to the source (a nav label lands once, in the include).
- The designer changes screens with their own agent; `/designli-design:publish "round n"`. The release diff on the portal names the screens that changed.
- Waive a state or reorder the journey on the portal; the next `feedback` merges it into `flow.json`; the next `publish` keeps it.

## Day 5: hand off

`/designli-design:handoff <slug> "<story title>"`. A Claude Code session with only the `designli-portal` server calls `get_handoff` and builds one flow from it (the portal docs' "For dev agents" page).

## What to record

Where the questions were unnecessary (the scan could have inferred it), where a file name defeated the scan, what the client could not find on the portal, and whether the handoff spec answered the developer's first three questions without a call.
