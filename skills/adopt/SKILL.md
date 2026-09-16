---
name: adopt
description: Declare the prototype's flows, steps and states: scans the HTML under design/, proposes flows (steps and states from file names, transitions from links), asks one grouped question per flow for what it cannot infer, writes flow.json files and design/prototype.json, lists the gaps. Re-runnable: only new files are asked about. --from-portal rebuilds the declarations from the latest release.
argument-hint: '[<folder>] [--from-portal]'
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/adopt.mjs*), Bash(node *scripts/gaps.mjs*), Bash(git status *)
---

# adopt

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/adopt.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so call its tools (`project_status`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `publish`, `feedback_pull`, `edits_apply`, `feedback_digest`, `handoff`, ...) where the guide names them; the scripts in parentheses are the equivalent CLI.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Never mention script or tool names to the designer; speak of flows, steps, states, releases and feedback.
