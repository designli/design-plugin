---
name: review
description: Optional critique of a flow's bundled screens: impeccable critique plus the hardening and copy checklists and the structural gaps, as one change list the designer applies with their own tools before the next publish.
argument-hint: '<flow-slug> [--critique-only] [--apply-all]'
allowed-tools: Bash(node *scripts/bundle.mjs*), Bash(node *scripts/gaps.mjs*), Bash(node *scripts/install-impeccable.mjs*), Bash(node .claude/skills/impeccable/scripts/*), Bash(IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/*)
---

# review

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/review.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so call its tools (`project_status`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `publish`, `feedback_pull`, `edits_apply`, `feedback_digest`, `handoff`, ...) where the guide names them; the scripts in parentheses are the equivalent CLI.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Never mention script or tool names to the designer; speak of flows, steps, states, releases and feedback.
