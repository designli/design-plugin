---
name: handoff
description: Package a reviewed flow for developers. Verifies states coverage and design-system drift, writes ./specs/<user story title>/design-flow.md plus flattened HTML references per screen state, and points the developer at the designli-skills pipeline (refine-us, us-to-tus, us-to-specs, implement-specs-nextjs).
argument-hint: '<flow-slug> "<user story title>" [--force] [--allow-local]'
disable-model-invocation: true
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/flow-check.mjs*), Bash(node *scripts/dc-to-html.mjs*), Bash(node *scripts/bundle.mjs*), Bash(node *scripts/portal.mjs*), Bash(git status *), Bash(ls *)
---

# handoff

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/handoff.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so you may call its tools (`project_status`, `flow_check`, `bundle`, `portal_push`, ...) instead of the scripts the guide names in parentheses; both are equivalent.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Where it says a parallel worker per step is optional, you may use the `artboard-author` agent. Never mention script names to the designer.
