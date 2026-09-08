# Artboard house rules (`.dc.html`)

These rules apply to every artboard the plugin authors. The built-in `design` skill owns the file format; this file adds the conventions that make artboards machine-checkable and hand-off ready.

## Files and names

- Flow map: `Main.dc.html` (always present; the artboard a fresh canvas opens on).
- Screen state: `NN-StepId-State.dc.html`, for example `01-ChoosePlan-Default.dc.html`, `03-Payment-Error.dc.html`. `NN` is the two-digit step number, `StepId` is PascalCase without spaces or hyphens, `State` comes from `states-checklist.md`.
- Component artboards: `Cmp<Name>.dc.html` (for example `CmpNavbar.dc.html`), owned by the Components sheet under `design/components/`. Flow canvases include them on a `Components` page but never edit them.
- Stems are unique case-insensitively across the whole canvas.

## Content rules

1. **Lift, do not invent.** Every color, font, size, radius, border, shadow, spacing and control height comes from `DESIGN.md`, `.impeccable/design.json`, or the real component source. Follow tokens to their resolved values; never round to a 4/8px grid.
2. **Inline styles on everything the designer may restyle.** The canvas properties panel edits inline `style="..."`; put shared resets and `a`/`a:hover` colors in `<helmet><style>`.
3. **Literal copy.** Text is written as literal markup so the designer retypes it in place. No `{{bindings}}`, `<sc-for>`, `<sc-if>` or `data-props` tweaks in screen-state artboards. (Static artboards need no `<script data-dc-script>` at all.)
4. **Chrome via import only.** Navbar, categories bar, footer, and a modal frame may be included with `<dc-import name="CmpNavbar" hint-size="100%,88px"></dc-import>`. Everything else is literal markup. Never self-close `dc-import`, never capitalize it as a tag.
5. **Traceability attributes** (inert in the editor, read by `flow-check.mjs` and dev agents):
   - `data-component="<repo path>#<export>[/<variant>]"` on every element that maps to a codebase component, for example `data-component="src/components/ui/button.tsx#Button/destructive"`.
   - `data-token="<css variable name without dashes prefix>"` on elements whose color comes from a token, for example `data-token="vk-red"`.
   - `data-legacy="true"` plus a reason in `# Components Used` when an element deliberately reproduces a legacy widget (for example the MUI spinner).
   - `data-external="stripe"` on placeholders for third-party iframes; their palette is exempt from the token check.
6. **Layout that survives editing.** Flex or grid with `gap` for sibling groups; no whitespace-spaced inline siblings; `display: grid` with `grid-template-columns: repeat(N, minmax(0, 1fr))` when a grid is needed.
7. **Icons are inline SVG** (stroke-based, 16/20/24 grid, one style). No emoji, no icon fonts. Copy the app's lucide or FontAwesome glyph paths when the real component uses one.
8. **No fake device chrome** (status bars, keyboards). No filler sections. Realistic sample data; bracketed `[PLACEHOLDER]` for facts you do not have.
9. **No secrets or customer data.** `flow-check.mjs` greps artboards for emails, keys, and tokens; use `jane@example.com`-style samples.
10. **Frame sizing.** Desktop screens use a 1440-wide root; mobile 390. Set the root element's background and an explicit height so surplus frame paints instead of clipping.

## Flow map (`Main.dc.html`)

A single artboard that shows the whole path: one box per step (number, name, surface), arrows for transitions with their trigger as a label, a short legend, and this exact comment convention printed on the map:

> Comment on the canvas with the artboard name first, e.g. `02-Account-Error: the message reads like a toast`.

Draw it with inline SVG or absolutely positioned boxes; keep it under 1440x900 so it reads without zooming.
