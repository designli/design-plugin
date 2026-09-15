---
name: review
description: Review a designed flow. Pulls the comments and copy edits left on the portal, runs a UX critique and a states/edge-case check, proposes changes, applies the ones the designer approves, republishes, replies and resolves. Use after someone commented on a flow or when asked to review, critique or harden a flow.
argument-hint: "<flow-slug> [--comments-only] [--critique-only] [--apply-all]"
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/flow-check.mjs*), Bash(node *scripts/dc-to-html.mjs*), Bash(node *scripts/bundle.mjs*), Bash(node *scripts/portal.mjs*), Bash(node .claude/skills/impeccable/scripts/*), Bash(IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/*)
---

# review

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/review.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so you may call its tools (`project_status`, `flow_check`, `bundle`, `portal_push`, ...) instead of the scripts the guide names in parentheses; both are equivalent.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Where it says a parallel worker per step is optional, you may use the `artboard-author` agent. Never mention script names to the designer.
