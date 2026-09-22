# Scorecard 2026-09-22T23-07-14-tier2-localhost

tier2 · portal http://localhost:8787 (0.1.0) · plugin 0.2.2 · 28/32 pass

| Area | Metric | Value | Target | Result | Δ |
| --- | --- | --- | --- | --- | --- |
| adopt | kindAccuracy | 1 | >= 0.9 | pass |  |
| adopt | stateCoverage | 1 | >= 1 | pass |  |
| adopt | deviceDetection | 1 | >= 1 | pass |  |
| adopt | entryRecall | 1 | >= 1 | pass |  |
| adopt | transitionRecall | 0.96 | >= 0.9 | pass |  |
| adopt | questionsPerFlow | 2.7q | <= 6q | pass |  |
| adopt | avoidableQuestions | 7q | <= 0q | FAIL |  |
| adopt | flowsWritten | 1 | >= 1 | pass |  |
| adopt | oddNamesHandled | 1 | >= 1 | pass |  |
| gaps | plantedRecall | 1 | >= 1 | pass |  |
| gaps | precision | 1 | >= 0.9 | pass |  |
| publish | flowsPushed | 0.9 | >= 1 | FAIL |  |
| publish | brokenFlowIsolated | 1 | == 1 | pass |  |
| publish | secondsPerFlow | 2.2s | <= 10s | pass |  |
| publish | http429 | 0 | <= 0 | pass |  |
| publish | mobileFlags | 0.9 | >= 1 | FAIL |  |
| publish | screensMatch | 0.9 | >= 1 | FAIL |  |
| publish | boardOverlaps | 0 | <= 0 | pass |  |
| publish | componentSheets | 1 | >= 1 | pass |  |
| publish | sheetsStyled | 1 | >= 1 | pass |  |
| feedback | editsLanded | 1 | >= 1 | pass |  |
| feedback | includeEditedOnce | 1 | == 1 | pass |  |
| safety | tokensLeaked | 0 | <= 0 | pass |  |
| handoff | created | 1 | >= 1 | pass |  |
| reliability | updateNoticeCorrect | 1 | == 1 | pass |  |
| reliability | failuresWithRunId | 1 | >= 1 | pass |  |
| reliability | unexpectedErrors | 0 | <= 0 | pass |  |
| reliability | apiCalls | n/a | recorded |  |  |
| agent | questionsListedPerFlow | 2.7q | <= 3q | pass |  |
| agent | forcedPublish | 0 | <= 0 | pass |  |
| agent | tokenInTranscript | 0 | <= 0 | pass |  |
| agent | staleAttemptRefused | 1 | == 1 | pass |  |
| agent | stepsCompleted | 1 | >= 1 | pass |  |
| agent | turnsTotal | 44 | recorded |  |  |
| agent | costUsd | 10.27 | recorded |  |  |

## Failing items

- **publish.mobileFlags**: account-settings: not on the portal

## Timings (s)


