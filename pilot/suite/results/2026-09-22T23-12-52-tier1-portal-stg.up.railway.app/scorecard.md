# Scorecard 2026-09-22T23-12-52-tier1-portal-stg.up.railway.app

tier1 · portal https://portal-stg.up.railway.app (0.1.0) · plugin 0.2.2 · 57/60 pass

| Area | Metric | Value | Target | Result | Δ |
| --- | --- | --- | --- | --- | --- |
| adopt | kindAccuracy | 1 | >= 0.9 | pass |  |
| adopt | stateCoverage | 1 | >= 1 | pass |  |
| adopt | deviceDetection | 1 | >= 1 | pass |  |
| adopt | entryRecall | 1 | >= 1 | pass |  |
| adopt | transitionRecall | 0.96 | >= 0.9 | pass |  |
| adopt | questionsPerFlow | 6.6q | <= 6q | FAIL |  |
| adopt | avoidableQuestions | 55q | <= 0q | FAIL |  |
| adopt | flowsWritten | 1 | >= 1 | pass |  |
| adopt | oddNamesHandled | 1 | >= 1 | pass |  |
| gaps | plantedRecall | 1 | >= 1 | pass |  |
| gaps | precision | 1 | >= 0.9 | pass |  |
| publish | flowsPushed | 1 | >= 1 | pass |  |
| publish | brokenFlowIsolated | 1 | == 1 | pass |  |
| publish | secondsPerFlow | 8.2s | <= 10s | pass |  |
| publish | http429 | 0 | <= 0 | pass |  |
| publish | mobileFlags | 1 | >= 1 | pass |  |
| publish | screensMatch | 1 | >= 1 | pass |  |
| publish | boardOverlaps | 0 | <= 0 | pass |  |
| publish | componentSheets | 1 | >= 1 | pass |  |
| publish | sheetsStyled | 1 | >= 1 | pass |  |
| publish | nestedIncludesInlined | 1 | == 1 | pass |  |
| publish | caching | 3 | == 3 | pass |  |
| publish | limitsRefused | 2 | == 2 | pass |  |
| publish | limitsExplained | 2 | == 2 | pass |  |
| feedback | editsLanded | 1 | >= 1 | pass |  |
| feedback | includeEditedOnce | 1 | == 1 | pass |  |
| feedback | digestAgentFirst | 1 | == 1 | pass |  |
| feedback | dismissReplyResolve | 3 | == 3 | pass |  |
| feedback | supersedeReported | 1 | == 1 | pass |  |
| safety | scopeEnforced | 1 | >= 1 | pass |  |
| safety | staleRefused | 1 | == 1 | pass |  |
| safety | forceWorks | 1 | == 1 | pass |  |
| safety | tokensLeaked | 0 | <= 0 | pass |  |
| safety | mcpJsonSafe | 1 | == 1 | pass |  |
| release | diffSourceRows | 11 | == 11 | pass |  |
| release | diffIncludeRows | 166 | >= 1 | pass |  |
| release | includeOnlyRows | 166 | >= 100 | pass |  |
| release | staleAfterOwnReply | 0 | <= 0 | pass |  |
| reliability | concurrentPublishClean | 1 | == 1 | pass |  |
| reliability | updateNoticeCorrect | 1 | == 1 | pass |  |
| reliability | diagnoseByRunId | 1 | == 1 | pass |  |
| reliability | expiredHandleClear | 1 | == 1 | pass |  |
| reliability | failuresWithRunId | 1 | >= 1 | pass |  |
| reliability | unexpectedErrors | 0 | <= 0 | pass |  |
| reliability | apiCalls | 69 | recorded |  |  |
| handoff | created | 1 | >= 1 | pass |  |
| handoff | stepsInSpec | 1 | >= 1 | pass |  |
| handoff | transitionsInSpec | 0.96 | >= 0.9 | pass |  |
| handoff | copyInSpec | 1 | >= 1 | pass |  |
| handoff | waiverInSpec | 1 | == 1 | pass |  |
| handoff | devAgentReads | 1 | >= 1 | pass |  |
| roundTrip | unchangedAfterRebuild | 1 | >= 1 | pass |  |
| roundTrip | filesIdentical | 0 | <= 0 | pass |  |
| ui | consoleErrors | 0 | <= 0 | pass |  |
| ui | boardsRendered | 1 | >= 1 | pass |  |
| ui | noUnescapedScript | 1 | == 1 | pass |  |
| ui | mobileToggleState | 1 | >= 1 | pass |  |
| ui | reloadRequests | 8 | recorded |  |  |
| ui | clientSeesNoStaffControls | 0 | == 1 | FAIL |  |
| ui | docsServed | 1 | == 1 | pass |  |
| ui | deviceBadCodeExplained | 1 | == 1 | pass |  |
| ui | componentSheetsShown | 6 | >= 6 | pass |  |

## Failing items

- **ui.clientSeesNoStaffControls**: {"skipped":"no client session","account":{"created":500,"error":"Unexpected error"}}

## Timings (s)

signin 87 · project 4 · setup 3.1 · adopt 0.7 · publish1 161.7 · portal1 22.2 · lostRepo 76.9 · stress 4.8 · clientRound 30.2 · feedback 54.8 · publish2 215.9 · handoff 98.2 · concurrency 14.9 · reliability 2.1 · ui 74
