# Third-party notices

## impeccable 3.5.0

`vendor/impeccable/3.5.0/` is an unmodified copy of the Claude Code build of
[impeccable](https://github.com/pbakaus/impeccable) by Paul Bakaus, licensed
under the Apache License 2.0. The license text is in
`vendor/impeccable/3.5.0/LICENSE` and the attribution notices in
`vendor/impeccable/3.5.0/NOTICE.md`. impeccable itself derives from Anthropic's
`frontend-design` skill and other sources credited in that NOTICE.

This plugin invokes impeccable through the project-local copy that
`scripts/install-impeccable.mjs` writes into `<project>/.claude/skills/impeccable/`.
No file inside `vendor/impeccable/` is modified; `PIN.json` beside it is ours.
