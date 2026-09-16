---
name: feedback
description: Pull the client's comments, copy edits and structure edits (waivers, step titles, entry points, journey order) from the Designli portal into the repository, apply the copy edits to the source (screen or include), print the digest grouped by flow, screen and state, then reply and resolve as items are addressed. Use after someone commented on the portal.
argument-hint: "[<flow-slug>] [--since last-publish|last-pull]"
allowed-tools: Bash(node *scripts/portal.mjs*), Bash(node *scripts/gaps.mjs*), Bash(git status *), Bash(git diff *)
---

# feedback

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/feedback.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so call its tools (`project_status`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `publish`, `feedback_pull`, `edits_apply`, `feedback_digest`, `handoff`, ...) where the guide names them; the scripts in parentheses are the equivalent CLI.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Never mention script or tool names to the designer; speak of flows, steps, states, releases and feedback.
