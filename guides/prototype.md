# prototype: build screens the portal can adopt

This guide is loaded while designing, not run as a step. It tells the designer's agent what the output must look like so `adopt` can read it without questions. The full contract is the resource `designli://rules/prototype`; the states rules are `designli://rules/states`. Read both once.

## What to produce

1. **One HTML file per screen state**, complete documents, under `design/flows/<slug>/`. Name files however reads best (`client-default.html`, `client-error.html`, `client-error-m.html` for mobile). A step's states are separate files, never a toggle.
2. **Shared parts as includes**: `design/components/<Name>.html`, pulled in with `<dc-import name="Name"></dc-import>`. Navbar, footer, sidebar, any block that repeats.
3. **Links are transitions**: `<a href="details-default.html">Continue</a>`; `data-on="…"` when the link text is not the trigger. Every primary action that leads somewhere links there.
4. **Mock data inline**, realistic: names, amounts, dates, the real error copy. No fetches.
5. **States by kind**: a form step needs Default, Validation, Submitting, Error; a data step needs Default, Loading, Empty, Error; a choice step Default, Loading, Error; a confirmation Default, Submitting, Error, Success; a result Default, Success; info Default. Design them or note the reason they do not apply.

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
