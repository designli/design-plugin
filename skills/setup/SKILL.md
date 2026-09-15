---
name: setup
description: Connect this repository to the Designli portal: portal URL, a scoped personal access token (typed in a terminal, never in chat), the portal project, the MCP configuration, and the commands to run next depending on whether the product is new or already has flows.
argument-hint: '[--url <portal url>] [--project <id>]'
disable-model-invocation: true
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/setup.mjs*), Bash(node *scripts/portal.mjs*), Bash(git status *)
---

# setup

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/setup.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so you may call its tools (`project_status`, `flow_check`, `bundle`, `portal_push`, ...) instead of the scripts the guide names in parentheses; both are equivalent.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Where it says a parallel worker per step is optional, you may use the `artboard-author` agent. Never mention script names to the designer.
