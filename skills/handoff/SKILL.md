---
name: handoff
description: Hand a reviewed flow off to developers at the current release: gates on strict gaps, then asks the portal to generate and store the spec (steps, states grid, copy, transitions, components, edge cases, screen URLs). Dev agents read it through the portal MCP get_handoff. Nothing is written into the repository.
argument-hint: '<flow-slug> "<user story title>" [--components A,B]'
disable-model-invocation: true
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/gaps.mjs*), Bash(node *scripts/portal.mjs*), Bash(git status *)
---

# handoff

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/handoff.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so call its tools (`project_status`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `publish`, `feedback_pull`, `edits_apply`, `feedback_digest`, `handoff`, ...) where the guide names them; the scripts in parentheses are the equivalent CLI.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Never mention script or tool names to the designer; speak of flows, steps, states, releases and feedback.
