---
name: status
description: One screen: connection, flows with their published version and unpublished changes, gaps by kind, open feedback on the portal, the last release, and the next command to run.
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/portal.mjs status*), Bash(node *scripts/gaps.mjs*)
---

# status

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/status.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so call its tools (`project_status`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `publish`, `feedback_pull`, `edits_apply`, `feedback_digest`, `handoff`, ...) where the guide names them; the scripts in parentheses are the equivalent CLI.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Never mention script or tool names to the designer; speak of flows, steps, states, releases and feedback.
