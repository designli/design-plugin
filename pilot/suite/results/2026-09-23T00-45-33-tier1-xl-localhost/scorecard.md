# Scorecard 2026-09-23T00-45-33-tier1-xl-localhost

tier1 · portal http://localhost:8787 (0.1.0) · plugin 0.2.3 · 49/68 pass

| Area | Metric | Value | Target | Result | Δ |
| --- | --- | --- | --- | --- | --- |
| adopt | kindAccuracy | 1 | >= 0.9 | pass |  |
| adopt | stateCoverage | 0.968 | >= 1 | FAIL |  |
| adopt | deviceDetection | 1 | >= 1 | pass |  |
| adopt | entryRecall | 1 | >= 1 | pass |  |
| adopt | transitionRecall | 0.884 | >= 0.9 | FAIL |  |
| adopt | journeyLinksRecall | 1 | >= 1 | pass |  |
| adopt | questionsPerFlow | 6.143q | <= 6q | FAIL |  |
| adopt | avoidableQuestions | 106q | <= 0q | FAIL |  |
| adopt | flowsWritten | 1 | >= 1 | pass |  |
| adopt | oddNamesHandled | 1 | >= 1 | pass |  |
| gaps | plantedRecall | 1 | >= 1 | pass |  |
| gaps | precision | 0.6 | >= 0.9 | FAIL |  |
| publish | flowsPushed | 1 | >= 1 | pass |  |
| publish | brokenFlowIsolated | 1 | == 1 | pass |  |
| publish | secondsPerFlow | 0.1s | <= 10s | pass |  |
| publish | http429 | 0 | <= 0 | pass |  |
| publish | mobileFlags | 1 | >= 1 | pass |  |
| publish | screensMatch | 0.857 | >= 1 | FAIL |  |
| publish | boardOverlaps | 0 | <= 0 | pass |  |
| publish | componentSheets | 1 | >= 1 | pass |  |
| publish | sheetsStyled | 1 | >= 1 | pass |  |
| publish | nestedIncludesInlined | 1 | == 1 | pass |  |
| publish | caching | 3 | == 3 | pass |  |
| publish | limitsRefused | 2 | == 2 | pass |  |
| publish | limitsExplained | 2 | == 2 | pass |  |
| safety | tokensLeaked | 0 | <= 0 | pass |  |
| safety | mcpJsonSafe | 1 | == 1 | pass |  |
| xl | publishSecondsPerFlow | 0.1s | <= 12s | pass |  |
| xl | http429 | 0 | <= 0 | pass |  |
| journey | connectors | 30 | == 30 | pass |  |
| dedupe | ratio | 0.966 | recorded |  |  |
| rounds | A.commentsAccepted | 29 | == 25 | FAIL |  |
| rounds | A.supersedeReported | 1 | == 1 | pass |  |
| rounds | A.clientWaiverRefused | 1 | == 1 | pass |  |
| rounds | A.structureAccepted | 0 | == 1 | FAIL |  |
| rounds | A.reopenWorks | 1 | == 1 | pass |  |
| release2 | editsLanded | 0.5 | == 1 | FAIL |  |
| release2 | diffShape | 0.25 | == 1 | FAIL |  |
| release2 | orphanCommentsReadable | 0 | == 1 | FAIL |  |
| release2 | deletedFlowStillOnPortal | true | recorded |  |  |
| release2 | renamedFlowLeavesOld | true | recorded |  |  |
| release2 | waiversSurvive | 1 | == 1 | pass |  |
| release2 | stepTitleKept | portal | recorded |  |  |
| roundB | staleEditNeedsManual | 1 | == 1 | pass |  |
| roundB | waiverOnPresent | 422 | recorded |  |  |
| release3 | subsetPublish | 1 | == 1 | pass |  |
| release3 | handoffFrozen | 0 | == 1 | FAIL |  |
| release4 | forcedAudited | 0 | == 1 | FAIL |  |
| release4 | noopHandled | refused | recorded |  |  |
| mcp | devAgent | 0 | == 4 | FAIL |  |
| mcp | clientRefused | 2 | == 2 | pass |  |
| mcp | tokenLeaked | 0 | <= 0 | pass |  |
| concurrency | threeFlowsClean | 0 | == 1 | FAIL |  |
| handoff | created | 1 | >= 1 | pass |  |
| roundTrip | unchangedAfterRebuild | 1 | >= 1 | pass |  |
| roundTrip | filesIdentical | 0 | <= 0 | pass |  |
| reliability | updateNoticeCorrect | 1 | == 1 | pass |  |
| reliability | diagnoseByRunId | 1 | == 1 | pass |  |
| reliability | expiredHandleClear | 1 | == 1 | pass |  |
| reliability | failuresWithRunId | 1 | >= 1 | pass |  |
| reliability | unexpectedErrors | 1 | <= 0 | FAIL |  |
| reliability | apiCalls | 166 | recorded |  |  |
| ui | consoleErrors | 0 | <= 0 | pass |  |
| ui | boardsRendered | 1 | >= 1 | pass |  |
| ui | noUnescapedScript | 1 | == 1 | pass |  |
| ui | mobileToggleState | 1 | >= 1 | pass |  |
| ui | reloadRequests | 8 | recorded |  |  |
| ui | clientSeesNoStaffControls | 1 | == 1 | pass |  |
| ui | docsServed | 1 | == 1 | pass |  |
| ui | deviceBadCodeExplained | 1 | == 1 | pass |  |
| ui | componentSheetsShown | 10 | >= 10 | pass |  |
| ui | journeyConnectors | 166 | == 30 | FAIL |  |
| ui | orphanVersionVisible | 0 | == 1 | FAIL |  |
| ui | release2DiffShown | 1 | == 1 | pass |  |
| ui | sheets | 10 | == 11 | FAIL |  |
| ui | xssEscaped | 1 | == 1 | pass |  |

## Failing items

- **adopt.stateCoverage**: buy-tickets 03-Payment: Custom-3dsecure,Custom-Declined,Default,Disabled,Empty,Error,Loading,Partial,Selected,Stale,Submitting,Success,Validation vs Default,Validation,Submitting,Error,Custom-Declined,Custom-3DSecure,Loading,Empty,Success,Disabled,Selected,Partial,Stale; reports 02-Export: Error,Submitting,Validation vs Default,Validation,Submitting,Error
- **adopt.transitionRecall**: wallet: 01-Balance-Default → 02-TopUp-Default (Continue); wallet: 02-TopUp-Default → 03-History-Default (Continue); reports: 01-Sales-Default → 02-Export-Default (Continue); reports: 02-Export-Default → 03-Done-Default (Continue); check-in-scan: 01-Scan-Default → 02-PrximoEvento-Default (Continue)
- **gaps.precision**: reports too-large design/flows/reports/02-export-default.html: ; reports state-missing 02 Default: 
- **publish.screensMatch**: create-an-event: 25 screens on the portal, 24 expected; reports: 9 screens on the portal, 10 expected; check-in-scan: 5 screens on the portal, 4 expected
- **rounds.A.structureAccepted**: status: {"stepTitles":2,"entryPoints":1,"status":[200,200],"clientRefused":true}
- **release2.editsLanded**: screen: 0 files, expected 8; nested: 0 files, expected 1; shared: 0 files, expected 1
- **release2.diffShape**: walletAdded: got {"seatMapRemoved":6,"walletAdded":5,"buyTicketsRenamed":{"removed":0,"added":0}}, expected removed=6 added=8 renamedEach=2; renamedRemoved: got {"seatMapRemoved":6,"walletAdded":5,"buyTicketsRenamed":{"removed":0,"added":0}}, expected removed=6 added=8 renamedEach=2; renamedAdded: got {"seatMapRemoved":6,"walletAdded":5,"buyTicketsRenamed":{"removed":0,"added":0}}, expected removed=6 added=8 renamedEach=2
- **release2.orphanCommentsReadable**: hasThreads: {"threadsOnRemovedScreen":0,"readableViaVersionsApi":true,"screen":"02-Row-Default"}
- **release3.handoffFrozen**: v3Created
- **release4.forcedAudited**: ok
- **mcp.devAgent**: listHandoffs: ok; getHandoff: ok; getStatesGrid: ok; getRelease: ok
- **concurrency.threeFlowsClean**: ok 1, conflicts 2, newVersions 3
- **reliability.unexpectedErrors**: publish: RATE_LIMITED Too many requests; slow down
- **ui.journeyConnectors**: loops: 1

## Timings (s)

signin 0 · project 0.1 · setup 0.4 · adopt 1.7 · publish1 4.4 · portal1 0.2 · lostRepo 2.3 · stress 0.8 · handoffV1 0.4 · journey 0 · roundA 0.5 · release2 3.6 · roundB 0.3 · release3 10.1 · release4 6.6 · mcp 0 · concurrency3 3 · reliability 0.4 · ui 44.7
