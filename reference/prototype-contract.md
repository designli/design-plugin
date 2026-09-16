# The prototype contract

What the plugin asks of a prototype, and nothing more. Any tool, any agent, any framework of the designer's choice can produce it, as long as the output is static HTML that meets these five points.

## 1. One HTML file per screen state

A screen state is one file. `client-default.html`, `client-error.html`, `02-details-validation.html`, `01-Client-Default.dc.html`: any name works, because `flow.json` maps each step and state to its file. What matters is that a state is a file, not a toggle inside one file. A mobile variant is a separate file, declared per state (`{ "desktop": "client-error.html", "mobile": "client-error-m.html" }`), or found by name: `-m`, `-mobile`, `.mobile`, `_mobile` or `-Mobile` before the extension.

The file is a complete document (`<!doctype html>` … `</html>`) that renders on its own in a browser. Tailwind by CDN, plain CSS, inline styles, Google Fonts: all fine. Pin what you load from outside (a Tailwind version, a font URL) so the screen renders the same in a year.

## 2. Shared parts as includes

Chrome and repeated blocks (navbar, footer, sidebar, a card that appears on six screens) live in `design/components/<Name>.html` and are pulled into a screen with

```html
<dc-import name="Navbar"></dc-import>
```

A component file is a fragment (just the markup) or a full document (its `<body>` is inlined and its `<style>` and `<link>` tags are hoisted into the screen's head). The bundle flattens includes, so the portal shows complete screens; the source keeps one copy of each shared part, so a copy edit on a nav label lands once. Components are listed on the portal with the screens that use them.

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
