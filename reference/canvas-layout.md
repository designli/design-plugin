# Canvas layout conventions (`canvas.json`)

## Pages

```json
"pages": [
  { "id": "flow", "name": "Flow" },
  { "id": "components", "name": "Components" }
]
```

Every artboard and note carries `"page": "flow"` or `"page": "components"`. `launch` is always `{ "view": "canvas", "page": "flow" }` on a flow canvas and `{ "view": "canvas" }` on the Components sheet (single page, no `pages` key).

## Grid for the Flow page

- Column order is the fixed state order: `Default, Loading, Empty, Validation, Submitting, Error, Success, Disabled, Selected, Partial, Stale, Custom-*`. Columns that a step does not use collapse (no gaps).
- One row per step, in step order. Row height is the tallest artboard in the row.
- `x = col * (w + 120)`, `y = rowTop`; next `rowTop = previousRowBottom + 200`. Frame width `w` matches the artboard root (1440 desktop, 390 mobile); `h` is the artboard's real height plus 5% slack.
- `Main.dc.html` sits above row 01 at `x: 0, y: -(mainHeight + 240)`.
- Mobile variants, when designed, go in a second block of rows below the desktop rows with the same column logic, titled `Mobile`.

## Sticky notes (`annotations`)

- One per step at the row's top-left: id `note-sNN`, `x: 0`, `y: rowTop - 140`, `w: 520`, text: `NN <Step name>. Entry: <entry points>. Primary: <primary action>. Kind: <kind>.`
- One per transition at the row's right end: id `note-sNN-to-sMM`, text: `-> MM <Step> on <trigger>. Error -> NN-Error (<recovery>).`
- Review conventions note at `x: 0, y: -(mainHeight + 400)`, id `note-howto`: the comment convention and the two next commands.
- Ids match `[A-Za-z0-9_-]{1,40}` and are unique. GUI-created notes are `note-1`, `note-2`, ...; read existing ids from an extracted `canvas.json` before re-seeding so nothing collides. Keep editor-set style keys you read back (`kind`, `size`, `bold`, `italic`, `color`).

## Components page

Component artboards (`Cmp*.dc.html`) copied from `design/components/` are laid out in a single row at `y: 0`, 120px apart, on the `components` page. They exist so `dc-import` resolves; they are not edited from a flow canvas.

## Per-artboard fields

- `title`: `NN Step · State` (cosmetic; the file stem stays the identity).
- `is_interactive: true` only on prototype artboards (`--prototype`).
- `expand: "fit"` (default) for screens; `"fill"` only for long scrolling pages with a fluid root.
