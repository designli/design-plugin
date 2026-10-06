# prototype: build screens the portal can adopt

This guide is loaded while designing, not run as a step. It tells the designer's agent what the output must look like so `adopt` can read it without questions. The full contract is the resource `designli://rules/prototype`; the states rules are `designli://rules/states`. Read both once.

## What to produce

1. **One HTML file per screen state**, complete documents, under `design/flows/<slug>/`. Name files however reads best (`client-default.html`, `client-error.html`, `client-error-m.html` for mobile; the scan reads the state from the last word whatever its case, and `flow.json` records the vocabulary's spelling, `Default`, `Error`). A step's states are separate files, never a toggle.
2. **Shared parts as includes**: `design/components/<Name>.html`, pulled in with `<dc-import name="Name"></dc-import>`. Navbar, footer, sidebar, any block that repeats. An include is a fragment styled by the screen that imports it; the portal shows each one as a sheet rendered inside the head of a screen that uses it, so it looks as it does in context. Put the shared CSS (tokens, base rules, the classes includes rely on) in `design/components/Styles.html` and import it from every screen's `<head>`, so it exists once and every sheet gets it. Any other file in `design/components/` also becomes a sheet: add `Buttons.html` or `Inputs.html` showing the variants when the product has a visible system worth reviewing, named by what they show. Do not invent them for a product that has none.
3. **Links are transitions**: `<a href="details-default.html">Continue</a>`; `data-on="…"` when the link text is not the trigger. Every primary action links to the screen it leads to; see "No dead ends" below.
4. **Mock data inline**, realistic: names, amounts, dates, the real error copy. No fetches.
5. **States by kind**: a form step needs Default, Validation, Submitting, Error; a data step needs Default, Loading, Empty, Error; a choice step Default, Loading, Error; a confirmation Default, Submitting, Error, Success; a result Default, Success; info Default. Design them or note the reason they do not apply.

## No dead ends

The client plays the prototype by clicking inside the screens, so every screen needs a way onward.

- Every screen that is not Loading or Submitting links somewhere. Those two are the exceptions: they move on by themselves.
- Error, Validation and Empty link to their recovery: try again, back to the form, the one action out of the empty state.
- The last step is a `result` step, or its screens link into the next flow (`<a href="../<slug>/<file>.html">`).
- A nav item either links to a real screen or is a `<button>`, never `href="#"`: the client clicks it and nothing happens.
- A button that navigates carries `data-goto="<file>.html"`, plus `data-on="..."` when its text is not the trigger.
- No fetches, and no script that can throw: the portal shows the screen exactly as it is.
- When a screen really is where the flow ends and its step is not a `result`, declare it in `flow.json` under `exits` with a fact: `"exits": { "05-Done-Success": "the user closes the app here, nothing follows it" }`. A preference ("not needed") is not a reason, the same rule as a waived state.

Check this before publishing: the `gaps` list names every screen with no way onward, every step nothing leads to, and every link that goes nowhere. Fix them on the screens.

### How the client plays it

The flow has a Play button on the portal. The client clicks the buttons and links inside the screens and moves through the flow like a real app. Click somewhere that is not a link and the clickable places flash, so they can see where to go. Loading and Submitting screens continue on their own after about a second. A path nobody designed shows a quiet card saying so, with a way back, never an error. That card is the reason for the rule above: a screen with no way onward ends the client's run early, and they never see the rest of the work.

## How to work

- Start from the product basics: name, who it is for, what it does (`design/prototype.json.product` or `PRODUCT.md`). Ask once if none exists.
- Pick the devices once (`design/prototype.json.devices`; default desktop 1440×900, mobile 390×844). A mobile variant is a separate file per state.
- Pin external resources (Tailwind version, font URLs).
- Put `<title>` on every file: it becomes the step's purpose in the proposal.
- Keep copy literal and final-looking: the client edits copy on the portal, and those edits are applied back to these files by text match. Text inside an include is edited once, in the include.
- When adding to an adopted flow, keep the names consistent with the existing files and run `adopt` again: only the new files are asked about.

## Do not

- Do not build a single-page app with client-side routing: states must be files.
- Do not depend on a build step to view a screen: opening the file in a browser must work.
- Do not put the same nav markup in every file: use an include.
- Do not invent a tokens system or a component library the product does not have; match what exists (a codebase's design system, or the direction the designer chose).

When the screens exist: run `adopt`.
