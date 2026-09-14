# Flow

- Name: <Flow name>
- Slug: <flow-slug>
- Goal: <one sentence: who does what and what "done" means>
- Device: desktop 1440x900 (mobile: <designed | not designed; responsive rules in # Accessibility>)
- Theme: light (dark mode: <not designed | designed>)
- Canvas: <artifact url> (version <n>)
- Status: <draft | reviewed | handed-off>
- Design system: DESIGN.md, components sheet <url>

# Entry Points

- <Where the user comes from> -> <NN Step>
- <Where the user comes from> -> <NN Step>

# Steps

| # | Step | Kind | Surface | Purpose | Primary action | Next |
|---|------|------|---------|---------|----------------|------|
| 01 | <Step name> | form | <route or component> | <what the user accomplishes> | <button label> | 02 |

# Screen States

## 01 <Step name>

| State | Artboard | Trigger | What the user sees | Copy | Data | Exit |
|-------|----------|---------|--------------------|------|------|------|
| Default | design/01-StepId-Default.html | <when> | <one line> | <key copy> | <fields or data shown> | <action -> next> |
| Loading | design/01-StepId-Loading.html | <when> | <skeleton where> | | | |
| Error | design/01-StepId-Error.html | <what failed> | <where the message lives> | "<message>" | | <recovery> |
| Empty | n/a: <reason> | | | | | |

(one subsection per step, in order)

# Transitions and Decisions

- 01 -> 02 on <trigger>; <what visibly changes>
- 03 Confirm: if <condition> -> 03-Error (<message source>, inline under <element>)
- <Decision the design makes and why, e.g. "disabled button with helper text, not a toast">

# Copy

| Key | Text | Where |
|-----|------|-------|
| <step.key> | <verbatim string> | <NN State> |

(Verbatim strings; developers reuse them as-is. Reuse existing strings from the codebase where they exist.)

# Data

- <Data source or hook>: <fields / lookup keys>
- <Form fields and the validation schema they come from>
- <Third-party elements (e.g. Stripe PaymentElement) and their configuration>

# Edge Cases

- [ ] <Edge case and the expected behaviour>
- [ ] <Long content: names 40+ chars, prices with 4 digits, ...>
- [ ] <Double submit / repeated action>
- [ ] <Already logged in / already done>

# Accessibility

- Focus order: <per step>
- Errors: inline, linked with aria-describedby; summary announced
- Contrast: <token> on <background> passes AA for <text size>; <exceptions and the token used instead>
- Hit targets >= 44px on all controls
- Motion: <what animates, respects prefers-reduced-motion>

# Components Used

| Component | Source | Variant / notes |
|-----------|--------|-----------------|
| Button | src/components/ui/button.tsx#Button | default, outline; loading uses the built-in spinner |
| <NEW> <Name> | NEW | <why an existing component does not cover it> |

(Everything listed must exist in the repo or be marked NEW with a justification. Legacy widgets carry `data-legacy` in the artboard and a reason here.)

# Design References

- Portal: <portal url> (v<n>, pushed <date>)  or  Canvas: <artifact url> (version <n>)
- Flow map: design/Main.html
- Screen references: design/*.html (flattened static HTML; inline styles are exact values)
- Sources: design/flows/<flow-slug>/*.dc.html (edit these; the canvas re-seeds from them)
- Components sheet: <url>
- These references are the spec for this story, not the source of truth for the product's design system. After implementation the design DNA is refreshed from the code.

# States Coverage

| Step | Default | Loading | Empty | Validation | Submitting | Error | Success |
|------|---------|---------|-------|------------|------------|-------|---------|
| 01 <Step> | [x] | [x] | n/a: <reason> | n/a: <reason> | n/a: <reason> | [x] | n/a: <reason> |

(Every cell is `[x]` or `n/a: <reason>`. `[ ]` blocks handoff. Required states per kind are in the plugin's states-checklist.)

# Open Questions

- <Question the designer could not answer; default assumed: ...>

# Review log

- <date> v<n>: <what changed, from which comments / critique items>; critique score <n> (<snapshot file>)
