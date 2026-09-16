---
name: prototype
description: How to build screens the Designli portal can adopt: one static HTML file per screen state, includes for shared parts, links for transitions, mock data inline, the states each step kind needs. Load this while designing screens with any tool; it does not author screens itself.
argument-hint: '[<what is being designed>]'
allowed-tools: Bash(node *scripts/gaps.mjs*), Bash(node *scripts/adopt.mjs scan*)
---

# prototype

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/prototype.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so call its tools (`project_status`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `publish`, `feedback_pull`, `edits_apply`, `feedback_digest`, `handoff`, ...) where the guide names them; the scripts in parentheses are the equivalent CLI.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Never mention script or tool names to the designer; speak of flows, steps, states, releases and feedback.
