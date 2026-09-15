---
name: init
description: Set up a product repo for prompt-driven flow design: installs the pinned impeccable build, declares the canonical component library, writes PRODUCT.md and DESIGN.md anchored to the real tokens and components, and pushes the Components sheet to the portal. Run once per repo; --refresh after implementation changes tokens or components; --check only verifies the install.
argument-hint: '[--refresh] [--check] [--force]'
disable-model-invocation: true
allowed-tools: Bash(node *scripts/preflight.mjs*), Bash(node *scripts/install-impeccable.mjs*), Bash(node *scripts/tokens-css.mjs*), Bash(node *scripts/bundle.mjs*), Bash(node *scripts/portal.mjs*), Bash(node *scripts/flow-check.mjs*), Bash(node *scripts/setup.mjs*), Bash(node .claude/skills/impeccable/scripts/*), Bash(IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/*), Bash(git status *), Bash(git diff *), Bash(git rev-parse *)
---

# init

This skill is a thin wrapper: the workflow lives in `${CLAUDE_PLUGIN_ROOT}/guides/init.md`, which is harness-neutral. Read that file now and follow it exactly. The same guide, tools and prompts are served by the plugin's MCP server (`designli-design`, registered by this plugin), so you may call its tools (`project_status`, `flow_check`, `bundle`, `portal_push`, ...) instead of the scripts the guide names in parentheses; both are equivalent.

Plugin root: `${CLAUDE_PLUGIN_ROOT}` (the guide writes `<plugin>` for it). Run the plugin scripts as given; do not open or read them. Where the guide says "ask one grouped question with prefilled options", use AskUserQuestion. Where it says a parallel worker per step is optional, you may use the `artboard-author` agent. Never mention script names to the designer.
