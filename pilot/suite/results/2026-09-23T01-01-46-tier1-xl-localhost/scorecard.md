# Scorecard 2026-09-23T01-01-46-tier1-xl-localhost

tier1 · portal http://localhost:8787 (0.1.0) · plugin 0.2.3 · 65/68 pass · vs 2026-09-23T00-45-33-tier1-xl-localhost

| Area | Metric | Value | Target | Result | Δ |
| --- | --- | --- | --- | --- | --- |
| adopt | kindAccuracy | 1 | >= 0.9 | pass | 0 |
| adopt | stateCoverage | 1 | >= 1 | pass | +0.032 |
| adopt | deviceDetection | 1 | >= 1 | pass | 0 |
| adopt | entryRecall | 1 | >= 1 | pass | 0 |
| adopt | transitionRecall | 1 | >= 0.9 | pass | +0.116 |
| adopt | journeyLinksRecall | 1 | >= 1 | pass | 0 |
| adopt | questionsPerFlow | 6.143q | <= 6q | FAIL | 0 |
| adopt | avoidableQuestions | 106q | <= 0q | FAIL | 0 |
| adopt | flowsWritten | 1 | >= 1 | pass | 0 |
| adopt | oddNamesHandled | 1 | >= 1 | pass | 0 |
| gaps | plantedRecall | 1 | >= 1 | pass | 0 |
| gaps | precision | 1 | >= 0.9 | pass | +0.4 |
| publish | flowsPushed | 1 | >= 1 | pass | 0 |
| publish | brokenFlowIsolated | 1 | == 1 | pass | 0 |
| publish | secondsPerFlow | 0.1s | <= 10s | pass | 0 |
| publish | http429 | 0 | <= 0 | pass | 0 |
| publish | mobileFlags | 1 | >= 1 | pass | 0 |
| publish | screensMatch | 1 | >= 1 | pass | +0.143 |
| publish | boardOverlaps | 0 | <= 0 | pass | 0 |
| publish | componentSheets | 1 | >= 1 | pass | 0 |
| publish | sheetsStyled | 1 | >= 1 | pass | 0 |
| publish | nestedIncludesInlined | 1 | == 1 | pass | 0 |
| publish | caching | 3 | == 3 | pass | 0 |
| publish | limitsRefused | 2 | == 2 | pass | 0 |
| publish | limitsExplained | 2 | == 2 | pass | 0 |
| safety | tokensLeaked | 0 | <= 0 | pass | 0 |
| safety | mcpJsonSafe | 1 | == 1 | pass | 0 |
| xl | publishSecondsPerFlow | 0.1s | <= 12s | pass | 0 |
| xl | http429 | 0 | <= 0 | pass | 0 |
| journey | connectors | 30 | == 30 | pass | 0 |
| dedupe | ratio | 0.966 | recorded |  | 0 |
| rounds | A.commentsAccepted | 29 | == 29 | pass | 0 |
| rounds | A.supersedeReported | 1 | == 1 | pass | 0 |
| rounds | A.clientWaiverRefused | 1 | == 1 | pass | 0 |
| rounds | A.structureAccepted | 1 | == 1 | pass | +1 |
| rounds | A.reopenWorks | 1 | == 1 | pass | 0 |
| release2 | editsLanded | 1 | == 1 | pass | +0.5 |
| release2 | diffShape | 1 | == 1 | pass | +0.75 |
| release2 | orphanCommentsReadable | 1 | == 1 | pass | +1 |
| release2 | deletedFlowStillOnPortal | true | recorded |  |  |
| release2 | renamedFlowLeavesOld | true | recorded |  |  |
| release2 | waiversSurvive | 1 | == 1 | pass | 0 |
| release2 | stepTitleKept | portal | recorded |  |  |
| roundB | staleEditNeedsManual | 1 | == 1 | pass | 0 |
| roundB | waiverOnPresent | 422 | recorded |  | 0 |
| release3 | subsetPublish | 1 | == 1 | pass | 0 |
| release3 | handoffFrozen | 1 | == 1 | pass | +1 |
| release4 | forcedAudited | 1 | == 1 | pass | +1 |
| release4 | noopHandled | {"ok":true,"release":7,"pushed":0,"unchanged":20,"refused":false,"code":null} | recorded |  |  |
| mcp | devAgent | 4 | == 4 | pass | +4 |
| mcp | clientRefused | 2 | == 2 | pass | 0 |
| mcp | tokenLeaked | 0 | <= 0 | pass | 0 |
| concurrency | threeFlowsClean | 1 | == 1 | pass | +1 |
| handoff | created | 1 | >= 1 | pass | 0 |
| roundTrip | unchangedAfterRebuild | 1 | >= 1 | pass | 0 |
| roundTrip | filesIdentical | 0 | <= 0 | pass | 0 |
| reliability | updateNoticeCorrect | 1 | == 1 | pass | 0 |
| reliability | diagnoseByRunId | 1 | == 1 | pass | 0 |
| reliability | expiredHandleClear | 1 | == 1 | pass | 0 |
| reliability | failuresWithRunId | 1 | >= 1 | pass | 0 |
| reliability | unexpectedErrors | 0 | <= 0 | pass | -1 |
| reliability | apiCalls | 168 | recorded |  | +2 |
| ui | consoleErrors | 0 | <= 0 | pass | 0 |
| ui | boardsRendered | 1 | >= 1 | pass | 0 |
| ui | noUnescapedScript | 1 | == 1 | pass | 0 |
| ui | mobileToggleState | 1 | >= 1 | pass | 0 |
| ui | reloadRequests | 8 | recorded |  | 0 |
| ui | clientSeesNoStaffControls | 1 | == 1 | pass | 0 |
| ui | docsServed | 1 | == 1 | pass | 0 |
| ui | deviceBadCodeExplained | 1 | == 1 | pass | 0 |
| ui | componentSheetsShown | 10 | >= 10 | pass | 0 |
| ui | journeyConnectors | 31 | == 30 | FAIL | -135 |
| ui | orphanVersionVisible | 1 | == 1 | pass | +1 |
| ui | release2DiffShown | 1 | == 1 | pass | 0 |
| ui | sheets | 10 | == 10 | pass | 0 |
| ui | xssEscaped | 1 | == 1 | pass | 0 |

## Failing items

- **ui.journeyConnectors**: loops: 1

## Timings (s)

signin 0.1 · project 0.1 · setup 0.4 · adopt 1.6 · publish1 4.6 · portal1 0.2 · lostRepo 2.4 · stress 0.8 · handoffV1 0.4 · journey 0 · roundA 0.5 · release2 3.8 · roundB 0.3 · release3 20.1 · release4 26.4 · mcp 0 · concurrency3 2.8 · reliability 0.4 · ui 45.4
