# Scorecard 2026-09-23T01-22-14-tier1-xl-portal-stg.up.railway.app

tier1 · portal https://portal-stg.up.railway.app (0.1.0) · plugin 0.2.4 · 66/68 pass

| Area | Metric | Value | Target | Result | Δ |
| --- | --- | --- | --- | --- | --- |
| adopt | kindAccuracy | 1 | >= 0.9 | pass |  |
| adopt | stateCoverage | 1 | >= 1 | pass |  |
| adopt | deviceDetection | 1 | >= 1 | pass |  |
| adopt | entryRecall | 1 | >= 1 | pass |  |
| adopt | transitionRecall | 1 | >= 0.9 | pass |  |
| adopt | journeyLinksRecall | 1 | >= 1 | pass |  |
| adopt | questionsPerFlow | 6.143q | <= 6q | FAIL |  |
| adopt | avoidableQuestions | 106q | <= 0q | FAIL |  |
| adopt | flowsWritten | 1 | >= 1 | pass |  |
| adopt | oddNamesHandled | 1 | >= 1 | pass |  |
| gaps | plantedRecall | 1 | >= 1 | pass |  |
| gaps | precision | 1 | >= 0.9 | pass |  |
| publish | flowsPushed | 1 | >= 1 | pass |  |
| publish | brokenFlowIsolated | 1 | == 1 | pass |  |
| publish | secondsPerFlow | 7.6s | <= 10s | pass |  |
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
| safety | tokensLeaked | 0 | <= 0 | pass |  |
| safety | mcpJsonSafe | 1 | == 1 | pass |  |
| xl | publishSecondsPerFlow | 7.6s | <= 12s | pass |  |
| xl | http429 | 0 | <= 0 | pass |  |
| journey | connectors | 30 | == 30 | pass |  |
| dedupe | ratio | 0.966 | recorded |  |  |
| rounds | A.commentsAccepted | 29 | == 29 | pass |  |
| rounds | A.supersedeReported | 1 | == 1 | pass |  |
| rounds | A.clientWaiverRefused | 1 | == 1 | pass |  |
| rounds | A.structureAccepted | 1 | == 1 | pass |  |
| rounds | A.reopenWorks | 1 | == 1 | pass |  |
| release2 | editsLanded | 1 | == 1 | pass |  |
| release2 | diffShape | 1 | == 1 | pass |  |
| release2 | orphanCommentsReadable | 1 | == 1 | pass |  |
| release2 | deletedFlowStillOnPortal | true | recorded |  |  |
| release2 | renamedFlowLeavesOld | true | recorded |  |  |
| release2 | waiversSurvive | 1 | == 1 | pass |  |
| release2 | stepTitleKept | portal | recorded |  |  |
| roundB | staleEditNeedsManual | 1 | == 1 | pass |  |
| roundB | waiverOnPresent | 422 | recorded |  |  |
| release3 | subsetPublish | 1 | == 1 | pass |  |
| release3 | handoffFrozen | 1 | == 1 | pass |  |
| release4 | forcedAudited | 1 | == 1 | pass |  |
| release4 | noopHandled | {"ok":true,"release":7,"pushed":0,"unchanged":20,"refused":false,"code":null} | recorded |  |  |
| mcp | devAgent | 4 | == 4 | pass |  |
| mcp | clientRefused | 2 | == 2 | pass |  |
| mcp | tokenLeaked | 0 | <= 0 | pass |  |
| concurrency | threeFlowsClean | 1 | == 1 | pass |  |
| handoff | created | 1 | >= 1 | pass |  |
| roundTrip | unchangedAfterRebuild | 1 | >= 1 | pass |  |
| roundTrip | filesIdentical | 0 | <= 0 | pass |  |
| reliability | updateNoticeCorrect | 1 | == 1 | pass |  |
| reliability | diagnoseByRunId | 1 | == 1 | pass |  |
| reliability | expiredHandleClear | 1 | == 1 | pass |  |
| reliability | failuresWithRunId | 1 | >= 1 | pass |  |
| reliability | unexpectedErrors | 0 | <= 0 | pass |  |
| reliability | apiCalls | 167 | recorded |  |  |
| ui | consoleErrors | 0 | <= 0 | pass |  |
| ui | boardsRendered | 1 | >= 1 | pass |  |
| ui | noUnescapedScript | 1 | == 1 | pass |  |
| ui | mobileToggleState | 1 | >= 1 | pass |  |
| ui | reloadRequests | 8 | recorded |  |  |
| ui | clientSeesNoStaffControls | 1 | == 1 | pass |  |
| ui | docsServed | 1 | == 1 | pass |  |
| ui | deviceBadCodeExplained | 1 | == 1 | pass |  |
| ui | componentSheetsShown | 10 | >= 10 | pass |  |
| ui | journeyConnectors | 31 | == 31 | pass |  |
| ui | orphanVersionVisible | 1 | == 1 | pass |  |
| ui | release2DiffShown | 1 | == 1 | pass |  |
| ui | sheets | 10 | == 10 | pass |  |
| ui | xssEscaped | 1 | == 1 | pass |  |

## Failing items

none

## Timings (s)

signin 196.7 · project 3.6 · setup 2.9 · adopt 2.1 · publish1 316.5 · portal1 33.4 · lostRepo 152 · stress 4.1 · handoffV1 26.5 · journey 1.2 · roundA 98.9 · release2 316.4 · roundB 11 · release3 291.6 · release4 341 · mcp 6.2 · concurrency3 17.4 · reliability 1.6 · ui 97.2
