# Scorecard 2026-09-22T22-20-37-tier1-localhost

tier1 · portal http://localhost:8787 (0.1.0) · plugin 0.2.1 · 58/60 pass · vs 2026-09-22T22-16-36-tier1-localhost

| Area | Metric | Value | Target | Result | Δ |
| --- | --- | --- | --- | --- | --- |
| adopt | kindAccuracy | 1 | >= 0.9 | pass | 0 |
| adopt | stateCoverage | 1 | >= 1 | pass | 0 |
| adopt | deviceDetection | 1 | >= 1 | pass | 0 |
| adopt | entryRecall | 1 | >= 1 | pass | 0 |
| adopt | transitionRecall | 0.96 | >= 0.9 | pass | 0 |
| adopt | questionsPerFlow | 6.6q | <= 6q | FAIL | 0 |
| adopt | avoidableQuestions | 55q | <= 0q | FAIL | 0 |
| adopt | flowsWritten | 1 | >= 1 | pass | 0 |
| adopt | oddNamesHandled | 1 | >= 1 | pass | 0 |
| gaps | plantedRecall | 1 | >= 1 | pass | 0 |
| gaps | precision | 1 | >= 0.9 | pass | 0 |
| publish | flowsPushed | 1 | >= 1 | pass | 0 |
| publish | brokenFlowIsolated | 1 | == 1 | pass | 0 |
| publish | secondsPerFlow | 0.1s | <= 10s | pass | -0.1 |
| publish | http429 | 0 | <= 0 | pass | 0 |
| publish | mobileFlags | 1 | >= 1 | pass | 0 |
| publish | screensMatch | 1 | >= 1 | pass | 0 |
| publish | boardOverlaps | 0 | <= 0 | pass | 0 |
| publish | componentSheets | 1 | >= 1 | pass | 0 |
| publish | sheetsStyled | 1 | >= 1 | pass | 0 |
| publish | nestedIncludesInlined | 1 | == 1 | pass |  |
| publish | caching | 3 | == 3 | pass | 0 |
| publish | limitsRefused | 2 | == 2 | pass | 0 |
| publish | limitsExplained | 2 | == 2 | pass | 0 |
| feedback | editsLanded | 1 | >= 1 | pass | 0 |
| feedback | includeEditedOnce | 1 | == 1 | pass | 0 |
| feedback | digestAgentFirst | 1 | == 1 | pass | 0 |
| feedback | dismissReplyResolve | 3 | == 3 | pass | 0 |
| feedback | supersedeReported | 1 | == 1 | pass | 0 |
| safety | scopeEnforced | 1 | >= 1 | pass | 0 |
| safety | staleRefused | 1 | == 1 | pass | 0 |
| safety | forceWorks | 1 | == 1 | pass | 0 |
| safety | tokensLeaked | 0 | <= 0 | pass | 0 |
| safety | mcpJsonSafe | 1 | == 1 | pass | 0 |
| release | diffSourceRows | 11 | == 11 | pass | -2 |
| release | diffIncludeRows | 166 | >= 1 | pass | +2 |
| release | includeOnlyRows | 166 | >= 100 | pass | +2 |
| release | staleAfterOwnReply | 0 | <= 0 | pass | 0 |
| reliability | concurrentPublishClean | 1 | == 1 | pass | 0 |
| reliability | updateNoticeCorrect | 1 | == 1 | pass | 0 |
| reliability | diagnoseByRunId | 1 | == 1 | pass | 0 |
| reliability | expiredHandleClear | 1 | == 1 | pass | 0 |
| reliability | failuresWithRunId | 1 | >= 1 | pass | 0 |
| reliability | unexpectedErrors | 0 | <= 0 | pass | 0 |
| reliability | apiCalls | 70 | recorded |  | +1 |
| handoff | created | 1 | >= 1 | pass | 0 |
| handoff | stepsInSpec | 1 | >= 1 | pass | 0 |
| handoff | transitionsInSpec | 0.96 | >= 0.9 | pass | 0 |
| handoff | copyInSpec | 1 | >= 1 | pass | 0 |
| handoff | waiverInSpec | 1 | == 1 | pass | 0 |
| handoff | devAgentReads | 1 | >= 1 | pass | 0 |
| roundTrip | unchangedAfterRebuild | 1 | >= 1 | pass | 0 |
| roundTrip | filesIdentical | 0 | <= 0 | pass | 0 |
| ui | consoleErrors | 0 | <= 0 | pass | 0 |
| ui | boardsRendered | 1 | >= 1 | pass | 0 |
| ui | noUnescapedScript | 1 | == 1 | pass | 0 |
| ui | mobileToggleState | 1 | >= 1 | pass | 0 |
| ui | reloadRequests | 8 | recorded |  | 0 |
| ui | clientSeesNoStaffControls | 1 | == 1 | pass | 0 |
| ui | docsServed | 1 | == 1 | pass | 0 |
| ui | deviceBadCodeExplained | 1 | == 1 | pass | 0 |
| ui | componentSheetsShown | 6 | >= 6 | pass | 0 |

## Failing items

none

## Timings (s)

signin 0 · project 0.1 · setup 0.3 · adopt 0.5 · publish1 2 · portal1 0.1 · lostRepo 1 · stress 0.8 · clientRound 0.3 · feedback 0.8 · publish2 2.5 · handoff 0.8 · concurrency 0.6 · reliability 0.3 · ui 39.1
