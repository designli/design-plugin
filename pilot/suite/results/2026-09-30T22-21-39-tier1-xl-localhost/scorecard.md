# Scorecard 2026-09-30T22-21-39-tier1-xl-localhost

tier1 · portal http://localhost:8787 (0.1.0) · plugin 0.4.0 · 79/79 pass · vs 2026-09-30T22-19-59-tier1-xl-localhost

| Area | Metric | Value | Target | Result | Δ |
| --- | --- | --- | --- | --- | --- |
| adopt | kindAccuracy | 1 | >= 0.9 | pass | 0 |
| adopt | stateCoverage | 1 | >= 1 | pass | 0 |
| adopt | deviceDetection | 1 | >= 1 | pass | 0 |
| adopt | entryRecall | 1 | >= 1 | pass | 0 |
| adopt | transitionRecall | 1 | >= 0.9 | pass | 0 |
| adopt | journeyLinksRecall | 1 | >= 1 | pass | 0 |
| adopt | questionsPerFlow | 1.095q | <= 6q | pass | 0 |
| adopt | avoidableQuestions | 0q | <= 0q | pass | 0 |
| adopt | sureAsked | 0q | <= 0q | pass | 0 |
| adopt | flowsWritten | 1 | >= 1 | pass | 0 |
| adopt | oddNamesHandled | 1 | >= 1 | pass | 0 |
| gaps | plantedRecall | 1 | >= 1 | pass | 0 |
| gaps | precision | 1 | >= 0.9 | pass | 0 |
| play | playGaps | 1 | >= 1 | pass | 0 |
| play | playAgree | 1 | >= 1 | pass | 0 |
| publish | flowsPushed | 1 | >= 1 | pass | 0 |
| publish | brokenFlowIsolated | 1 | == 1 | pass | 0 |
| publish | secondsPerFlow | 0s | <= 10s | pass | 0 |
| publish | http429 | 0 | <= 0 | pass | 0 |
| publish | httpCallsPerFlow | 5.619 | recorded |  | 0 |
| publish | mobileFlags | 1 | >= 1 | pass | 0 |
| publish | screensMatch | 1 | >= 1 | pass | 0 |
| publish | boardOverlaps | 0 | <= 0 | pass | 0 |
| publish | componentSheets | 1 | >= 1 | pass | 0 |
| publish | sheetsStyled | 1 | >= 1 | pass | 0 |
| publish | nestedIncludesInlined | 1 | == 1 | pass | 0 |
| publish | caching | 3 | == 3 | pass | 0 |
| publish | limitsRefused | 2 | == 2 | pass | 0 |
| publish | limitsExplained | 2 | == 2 | pass | 0 |
| safety | tokensLeaked | 0 | <= 0 | pass | 0 |
| safety | mcpJsonSafe | 1 | == 1 | pass | 0 |
| xl | publishSecondsPerFlow | 0s | <= 12s | pass | 0 |
| xl | http429 | 0 | <= 0 | pass | 0 |
| journey | connectors | 30 | == 30 | pass | 0 |
| dedupe | ratio | 0.966 | recorded |  | 0 |
| rounds | A.commentsAccepted | 29 | == 29 | pass | 0 |
| rounds | A.supersedeReported | 1 | == 1 | pass | 0 |
| rounds | A.clientWaiverRefused | 1 | == 1 | pass | 0 |
| rounds | A.structureAccepted | 1 | == 1 | pass | 0 |
| rounds | A.reopenWorks | 1 | == 1 | pass | 0 |
| rounds | A.tooLargeUnavailable | 1 | == 1 | pass | 0 |
| release2 | editsLanded | 1 | == 1 | pass | 0 |
| release2 | diffShape | 1 | == 1 | pass | 0 |
| release2 | orphanCommentsReadable | 1 | == 1 | pass | 0 |
| release2 | portalOnlyReported | 1 | == 1 | pass | 0 |
| release2 | orphaningReported | 1 | == 1 | pass | 0 |
| release2 | deletedFlowStillOnPortal | 0 | <= 0 | pass | 0 |
| release2 | renamedFlowLeavesOld | 0 | <= 0 | pass | 0 |
| release2 | waiversSurvive | 1 | == 1 | pass | 0 |
| release2 | stepTitleKept | portal | recorded |  |  |
| roundB | staleEditNeedsManual | 1 | == 1 | pass | 0 |
| roundB | outdatedEdit | 1 | == 1 | pass | 0 |
| roundB | waiverOnPresent | 422 | recorded |  | 0 |
| release3 | subsetPublish | 1 | == 1 | pass | 0 |
| release3 | handoffFrozen | 1 | == 1 | pass | 0 |
| release4 | forcedAudited | 1 | == 1 | pass | 0 |
| release4 | noopHandled | 1 | == 1 | pass | 0 |
| release4 | noopCalls | 23 | recorded |  | 0 |
| mcp | devAgent | 4 | == 4 | pass | 0 |
| mcp | clientRefused | 2 | == 2 | pass | 0 |
| mcp | tokenLeaked | 0 | <= 0 | pass | 0 |
| concurrency | threeFlowsClean | 1 | == 1 | pass | 0 |
| handoff | created | 1 | >= 1 | pass | 0 |
| handoff | tooLargeRefused | VALIDATION | recorded |  |  |
| roundTrip | unchangedAfterRebuild | 1 | >= 1 | pass | 0 |
| roundTrip | filesIdentical | 0 | <= 0 | pass | 0 |
| reliability | updateNoticeCorrect | 1 | == 1 | pass | 0 |
| reliability | diagnoseByRunId | 1 | == 1 | pass | 0 |
| reliability | expiredHandleClear | 1 | == 1 | pass | 0 |
| reliability | failuresWithRunId | 1 | >= 1 | pass | 0 |
| reliability | unexpectedErrors | 0 | <= 0 | pass | 0 |
| reliability | apiCalls | 194 | recorded |  | 0 |
| ui | consoleErrors | 0 | <= 0 | pass |  |
| ui | boardsRendered | 1 | >= 1 | pass |  |
| ui | noUnescapedScript | 1 | == 1 | pass |  |
| ui | mobileToggleState | 1 | >= 1 | pass |  |
| ui | reloadRequests | 8 | recorded |  |  |
| ui | clientSeesNoStaffControls | 1 | == 1 | pass |  |
| ui | docsServed | 1 | == 1 | pass |  |
| ui | deviceBadCodeExplained | 1 | == 1 | pass |  |
| ui | componentSheetsShown | 10 | >= 10 | pass |  |
| ui | playClickable | 4 | >= 4 | pass |  |
| ui | journeyConnectors | 28 | == 28 | pass |  |
| ui | orphanVersionVisible | 1 | == 1 | pass |  |
| ui | release2DiffShown | 1 | == 1 | pass |  |
| ui | sheets | 10 | == 10 | pass |  |
| ui | xssEscaped | 1 | == 1 | pass |  |

## Failing items

none

## Timings (s)

signin 0 · project 0.1 · setup 0.3 · adopt 1.1 · publish1 1.5 · portal1 0.2 · lostRepo 1.2 · stress 0.8 · handoffV1 0.2 · journey 0 · roundA 0.5 · release2 2.6 · roundB 0.3 · release3 1.4 · release4 1.6 · mcp 0 · concurrency3 1.1 · reliability 0.3 · ui 48.9
