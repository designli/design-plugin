# Required states per step kind

Every step in a flow has a `kind`. The kind decides which states are required. A required state is either designed as a screen file or explicitly waived with `n/a: <reason>` in `flow.json`. A required state that is neither shows as a gap on the portal (the states grid) and blocks the handoff; it does not block publishing.

| Kind           | Use for                                                           | Required states                        | Optional states                                                                            |
| -------------- | ----------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `form`         | A step where the user enters data and submits                     | Default, Validation, Submitting, Error | Loading (prefilled data), Success (only if the step itself shows a success view), Disabled |
| `data`         | A step that displays fetched data (lists, details, dashboards)    | Default, Loading, Empty, Error         | Partial (some data failed), Stale                                                          |
| `choice`       | A step where the user picks one of a few options (plans, methods) | Default, Loading, Error                | Selected (if the selection is a distinct view), Empty                                      |
| `confirmation` | A modal or view that asks "are you sure" and performs an action   | Default, Submitting, Error, Success    |                                                                                            |
| `result`       | A terminal view (done, thank you, receipt, redirect target)       | Default, Success                       | Error (if the result can still fail)                                                       |
| `info`         | Static content (terms, explanation, landing)                      | Default                                | Loading                                                                                    |

State vocabulary is fixed. Use exactly these names in file stems and tables:

`Default` · `Loading` · `Empty` · `Validation` · `Submitting` · `Error` · `Success` · `Disabled` · `Selected` · `Partial` · `Stale`

Custom states are allowed only as `Custom-<Name>` (for example `Custom-TrialExtended`); the step's `purpose` should say what it is.

## What each state must show

- **Default**: the screen with realistic data (no lorem ipsum, no empty spans), primary action visible.
- **Loading**: skeletons or spinners in the exact places content will appear; controls disabled; no layout shift compared to Default.
- **Empty**: what a user with no data sees, including the one action that gets them out of the empty state.
- **Validation**: inline field errors with the real copy from the codebase's schema (yup, zod), error summary if the app uses one, focus on the first error.
- **Submitting**: the primary control in its loading form; other controls disabled; no second submit possible.
- **Error**: a failed request or action. Say where the message lives (inline, banner, toast) and what the recovery action is.
- **Success**: the confirmation the user sees before or instead of navigating away.

## Waiver rules

A state may be waived with `n/a: <reason>` only when the reason is a fact, not a preference. Acceptable: `n/a: prices always exist (static catalog)`, `n/a: success is step 04`, `n/a: unknown, confirm with PO`. Not acceptable: `n/a: not needed`, `n/a: later`.
