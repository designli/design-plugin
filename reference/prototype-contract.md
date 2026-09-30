# The prototype contract

What the plugin asks of a prototype, and nothing more. Any tool, any agent, any framework of the designer's choice can produce it, as long as the output is static HTML that meets these six points.

## 1. One HTML file per screen state

A screen state is one file. `client-default.html`, `client-error.html`, `02-details-validation.html`, `01-Client-Default.dc.html`: any name works, because `flow.json` maps each step and state to its file. What matters is that a state is a file, not a toggle inside one file. A mobile variant is a separate file, declared per state (`{ "desktop": "client-error.html", "mobile": "client-error-m.html" }`), or found by name: `-m`, `-mobile`, `.mobile`, `_mobile` or `-Mobile` before the extension.

The file is a complete document (`<!doctype html>` … `</html>`) that renders on its own in a browser. Tailwind by CDN, plain CSS, inline styles, Google Fonts: all fine. Pin what you load from outside (a Tailwind version, a font URL) so the screen renders the same in a year.

## 2. Shared parts as includes

Chrome and repeated blocks (navbar, footer, sidebar, a card that appears on six screens) live in `design/components/<Name>.html` and are pulled into a screen with

```html
<dc-import name="Navbar"></dc-import>
```

A component file is a fragment (just the markup) or a full document (its `<body>` is inlined and its `<style>`, `<link>` and external `<script src>` tags are hoisted into the screen's head). The bundle flattens includes, so the portal shows complete screens; the source keeps one copy of each shared part, so a copy edit on a nav label lands once. On the portal each component is a sheet rendered with the `<head>` and `<body>` attributes of a screen that imports it, so it carries the same fonts and styles as in context; a component no screen imports is rendered with the `Styles` include when `design/components/Styles.html` exists, and reported otherwise. `Styles.html` is the conventional home of shared CSS, imported from every screen's `<head>`; any other file under `design/components/` is a sheet too (a `Buttons.html` showing variants, for instance).

`.dc.html` artboards (the design-canvas format) are accepted too: `<x-dc>` root, `<helmet>` for styles, the same `<dc-import>`.

## 3. Links are transitions

A link from one screen file to another is a transition:

```html
<a href="details-default.html">Continue</a>
<button data-goto="details-default.html" data-on="Continue">Continue</button>
```

The label is the link text, or `data-on` when the text is not the trigger ("Continue with a client selected"). The plugin reads these into the flow's transitions and rewrites the links in the bundle so the published prototype is clickable on the portal. Transitions can also be declared or edited by hand in `flow.json`; the two are merged.

## 4. Mock data inline

No live APIs, no scripts that fetch. Realistic sample data written into the markup: real-looking names, amounts, dates, error messages with the actual copy. Small scripts for local interactivity (open a menu, toggle a tab) are allowed; they do not survive into a state, states are files.

## 5. The states vocabulary

`Default` · `Loading` · `Empty` · `Validation` · `Submitting` · `Error` · `Success` · `Disabled` · `Selected` · `Partial` · `Stale`, plus `Custom-<Name>` when nothing fits. Which states a step needs depends on its kind (form, data, choice, confirmation, result, info); see the states rules. A required state that has no file is a gap the client and the developer can see; it is not a blocker for publishing. Waiving one needs a reason that is a fact ("prices always exist: static catalog"), never a preference ("not needed").

## 6. No dead ends

The prototype is played, not only read: on the portal a flow has a Play button, and the client clicks the links and buttons inside the screens to move through it. So every screen carries a way onward.

- Every screen whose state is not `Loading` or `Submitting` links somewhere. Those two advance on their own after about a second, so they are the only screens allowed to have no action.
- `Error`, `Validation` and `Empty` link to their recovery: try again, back to the form, the one action out of the empty state.
- The flow's last step is a `result` step, or its screens link into the next flow (`../<slug>/<file>.html`); such a link is also what draws the journey arrow.
- A nav item either links to a real screen or is a `<button>`. `href="#"`, an empty href and `javascript:` are dead clicks; the plugin reports them and the portal treats them as a miss.
- A button that navigates carries `data-goto="<file>.html"` (with `data-on` when its text is not the trigger).
- No fetches, and no script that can throw: the portal serves the file as it is and never runs a build.
- A screen that really is where the flow ends, on a step that is not a `result`, is declared in `flow.json`:

```json
"exits": { "05-Done-Success": "the user closes the app here, nothing follows it" }
```

The reason follows the waiver rule: a fact, not a preference. An empty reason, or an id that is not a designed screen of the flow, is a gap.

What the plugin reports (all but the last block a handoff): `dead-end` (a screen with no way onward), `unreachable` (a step no path from the entry reaches), `exit-unreasoned`, `exit-unknown`, `broken-link` (a link or transition naming a screen the flow does not have) and, for information only, `dead-link` (`href="#"` and its kin).

What the client sees where the rule is broken: a quiet card, "This path isn't designed yet", with a way back. Never an error, and never a screen that traps them.

## Where things live

```
design/
  prototype.json          devices, components dir, product basics
  components/*.html       includes
  flows/<slug>/
    *.html                one file per screen state
    flow.json             steps, states → files, transitions, entry points, journey order
    comments.json         pulled feedback (committed)
    text-edits.json       pulled copy edits (committed)
    bundle/               build output (ignored)
  releases.json           cache of the portal's releases (never the record)
```

Optional, read when present: `PRODUCT.md` (product basics in impeccable's shape), `Main.html` in a flow folder (a hand-drawn map; the portal draws its own), `canvas.json` (frame sizes per file).

## Tags that help (optional)

- `data-component="Button/primary"` on an element that maps to a shared part or a design-system component: shows up in the handoff's components list.
- `<meta name="designli-device" content="mobile">` when the file name does not say it.
- `<title>` on every file: the scan uses it as the step's purpose when nothing better exists.
