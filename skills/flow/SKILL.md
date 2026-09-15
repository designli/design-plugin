---
name: flow
description: Design a multi-screen user flow (steps, states, transitions) for this product and push it to the Designli portal, where the designer and the client click through it, comment and edit copy. Use when a designer describes a journey to design ("checkout", "cancel subscription", "reset password", "onboarding") or asks to add screens or states to an existing flow.
argument-hint: '"<flow name or brief>" [--extend <flow-slug>] [--device desktop|mobile|both] [--prototype]'
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/flow-check.mjs*), Bash(node *scripts/bundle.mjs*), Bash(node *scripts/portal.mjs*), Bash(node .claude/skills/impeccable/scripts/*), Bash(IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/*), Bash(git status *)
---

# flow

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/flow.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so you may call its tools (`project_status`, `flow_check`, `bundle`, `portal_push`, ...) instead of the scripts the guide names in parentheses; both are equivalent.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Where it says a parallel worker per step is optional, you may use the `artboard-author` agent. Never mention script names to the designer.
