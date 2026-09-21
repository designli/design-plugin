---
name: setup
description: Connect this repository to the Designli portal: portal URL, a sign-in the designer approves in the browser (no token typed or pasted anywhere), the portal project, the MCP configuration, and the commands to run next. Refuses a repository without a git remote unless the designer accepts the risk.
argument-hint: '[--url <portal url>] [--project <id>]'
disable-model-invocation: true
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/setup.mjs*), Bash(node *scripts/portal.mjs*), Bash(git status *), Bash(git remote *)
---

# setup

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/setup.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so call its tools (`project_status`, `signin_start`, `signin_poll`, `prototype_scan`, `flows_propose`, `flows_write`, `gaps`, `publish`, `feedback_pull`, `edits_apply`, `feedback_digest`, `handoff`, ...) where the guide names them; the scripts in parentheses are the equivalent CLI.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Never mention script or tool names to the designer; speak of flows, steps, states, releases and feedback.
