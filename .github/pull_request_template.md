## What changed and why

<!-- One paragraph: the reason, not the diff. Link the issue or the plan. -->

## Checklist

- [ ] Decision record: yes, NNNN on the portal / no, because …
- [ ] Documentation updated (the guide, the README section, `reference/portal-api.md`, the portal's plugin page)
- [ ] Roadmap or plan touched (the portal's roadmap row, or the plan's Outcome section)
- [ ] Diagrams still true (the portal's `internal/architecture/plugin` page)
- [ ] Tests: `node --test "server/test/*.test.mjs"`
- [ ] Suite tier 1 run: `node pilot/suite/run.mjs --portal http://localhost:8787 --dev-admin` (scorecard committed)
