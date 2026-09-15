# Artboard house rules (`.dc.html`)

These rules apply to every artboard the plugin authors. The built-in `design` skill owns the file format; this file adds the conventions that make artboards machine-checkable and hand-off ready.

## Files and names

- Flow map: `Main.dc.html` (always present; the first artboard of the portal's Canvas view).
- Screen state: `NN-StepId-State.dc.html`, for example `01-ChoosePlan-Default.dc.html`, `03-Payment-Error.dc.html`. `NN` is the two-digit step number, `StepId` is PascalCase without spaces or hyphens, `State` comes from `states-checklist.md`.
- Component artboards: `Cmp<Name>.dc.html` (for example `CmpNavbar.dc.html`), owned by the Components sheet under `design/components/`. Flows import them with `dc-import` but never edit them.
- Stems are unique case-insensitively across the whole flow.

## Content rules

1. **Lift, do not invent.** Every color, font, size, radius, border, shadow, spacing and control height comes from `DESIGN.md`, `.impeccable/design.json`, or the real component source. Follow tokens to their resolved values; never round to a 4/8px grid.
2. **Inline styles on everything the designer may restyle.** Reviewers edit copy in place on the portal and developers read exact values from inline `style="..."`; put shared resets and `a`/`a:hover` colors in `<helmet><style>`.
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

> Comment on the screen in the portal; whole-flow comments start with the artboard name, e.g. `02-Account-Error: the message reads like a toast`.

Draw it with inline SVG or absolutely positioned boxes; keep it under 1440x900 so it reads without zooming.

## Interactive (prototype) artboards

Allowed only when `flow.json.prototype` is `true`, and only on the screens the designer asked to be clickable (normally the Default state of each step). Every other state stays static.

- Copy stays literal. Holes (`{{name}}`) are used only for state-driven values: a selection highlight in a `style` attribute, a computed total, a count. `<sc-if value="{{flag}}" hint-placeholder-val="{{ true }}">…</sc-if>` reveals or hides a block. Never `<sc-for>`: write list items literally and reveal extra, pre-written rows with `<sc-if>`.
- Events: `onClick="{{ handler }}"`, `onInput="{{ handler }}"` bound to functions returned from `renderVals()`; state lives in `this.state`.
- The script tag carries `data-flat`, a JSON object with the static value of every hole, as the screen should read in the developer handoff (the Default state): `<script data-dc-script data-props='{}' data-flat='{"selectedId":"c2","total":"$6,450.00","showNewClient":false}'>`. The handoff converter renders the static reference from it (drops the script and event bindings, resolves `<sc-if>` by the flat values, substitutes holes). Single-quote the attribute; escape `&` as `&amp;` and a literal single quote as `&#39;`.
- `canvas.json` marks the artboard `"is_interactive": true`.
- `flow-check` verifies: no `<sc-for>`, `data-flat` present and covering every hole; static artboards in the same flow still follow the static rules.

## Mobile variants

When `flow.json.devices` includes `"mobile"`, every referenced state has a sibling `NN-StepId-State-Mobile.dc.html` with a 390-wide root. Same content and states, stacked layout, a sticky bottom bar for the primary action, chrome via `CmpNavbarMobile`. Mobile artboards go in a second block of rows in `canvas.json` (see canvas-layout.md).
