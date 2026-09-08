# Greenfield: creating the design system from a direction

Used by `init` when preflight reports `greenfield: true` (no UI source in the repo). There is nothing to read, so the plugin creates the design DNA itself, in the same files and formats impeccable and the dev pipeline expect. Once code exists, `init --refresh` re-documents from the code and this seed becomes history.

## Sequence

1. Product identity round (PRODUCT.md). `## Codebase Conventions` says: greenfield; intended stack (default "Next.js + Tailwind + shadcn, to be confirmed by the team"); tokens live in `design/tokens.css` until code exists; components live in `design/components/`.
2. Direction round: color strategy and hue anchor, typography direction, motion energy, three named references and one anti-reference (impeccable's five seed questions, grouped in one stop). Run `IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/palette.mjs --from "<product name>"` for a deterministic seed hue; the designer's hue anchor wins if they gave one.
3. Directions canvas: three low-fi direction artboards on one canvas titled "<Product> Directions", each exploring a named axis you can state in a phrase ("Restrained editorial", "Committed color, dense", "Warm utility"). Same content (the product's first real screen), different systems: type pairing, color stance, density, radius, elevation. Low fidelity is enough to choose. One stop: pick A, B, C, or "mix" with a sentence. If the canvas cannot be published, describe each direction in one line and ask anyway.
4. Author the system from the chosen direction (below), export tokens, build the Components sheet, publish it.

## DESIGN.md (Stitch format, full tokens)

Frontmatter is normative. Hex colors (Stitch validates hex); keep OKLCH in prose and in design.json `colorMeta.canonical`. Descriptive slugs, not `blue-800`.

```yaml
---
name: <Product>
description: <one line>
colors:
  bg: "#f7f5f0"            # page background
  surface: "#ffffff"       # cards, sheets
  ink: "#1b1a17"           # primary text
  ink-muted: "#6b675e"     # secondary text
  primary: "#b5472d"       # brand action
  primary-deep: "#8d3521"  # hover / pressed
  accent: "#2d6b8f"        # links, highlights
  border: "#e4e0d6"
  success: "#2f7a4a"
  warning: "#b8791f"
  danger: "#b3261e"
typography:
  display: { fontFamily: "Fraunces, Georgia, serif", fontSize: "48px", fontWeight: 600, lineHeight: "1.05", letterSpacing: "-0.02em" }
  headline: { fontFamily: "Fraunces, Georgia, serif", fontSize: "32px", fontWeight: 600, lineHeight: "1.15" }
  title: { fontFamily: "Instrument Sans, system-ui, sans-serif", fontSize: "20px", fontWeight: 600, lineHeight: "1.3" }
  body: { fontFamily: "Instrument Sans, system-ui, sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: "1.5" }
  label: { fontFamily: "Instrument Sans, system-ui, sans-serif", fontSize: "13px", fontWeight: 500, lineHeight: "1.2", letterSpacing: "0.02em" }
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary: { backgroundColor: "{colors.primary}", textColor: "{colors.surface}", rounded: "{rounded.md}", padding: "12px 20px", height: "44px" }
  button-primary-hover: { backgroundColor: "{colors.primary-deep}" }
  button-secondary: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.md}", padding: "12px 20px", height: "44px" }
  button-ghost: { backgroundColor: "transparent", textColor: "{colors.primary}", padding: "12px 12px", height: "44px" }
  input: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.sm}", padding: "0 12px", height: "44px" }
  card: { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", padding: "24px" }
  chip: { backgroundColor: "{colors.bg}", textColor: "{colors.ink-muted}", rounded: "{rounded.lg}", padding: "4px 10px", height: "28px" }
---
```

Write the YAML with one value per line (nested keys on their own indented lines, not inline `{ }` maps) so the token exporter and impeccable's parser both read it. The example above is compressed for reading only.

The frontmatter must start on line 1 (impeccable's parser returns nothing otherwise). Put the SEED comment as the first body line, right after the closing `---`.

Body: the six sections in order (`## 1. Overview`, `## 2. Colors`, `## 3. Typography`, `## 4. Elevation`, `## 5. Components`, `## 6. Do's and Don'ts`), 1-3 Named Rules per section (`**The <Name> Rule.** <doctrine>`), the anti-reference quoted verbatim in Don'ts, a Creative North Star line in Overview, and this line as the first body line after the frontmatter:

`<!-- SEED (designli-design greenfield): authored from a chosen direction before any code existed. Re-run /designli-design:init --refresh once code exists to document the real tokens. -->`

Fonts: Google Fonts only (the canvas admits that host) or system stacks. Distinctive pairings; not Inter, Roboto, Arial. Every family gets a fallback stack. Contrast: body text pairs must pass WCAG AA; note exceptions.

## .impeccable/design.json (schemaVersion 2)

`{ schemaVersion: 2, generatedAt, title: "Design System: <Product>", extensions: { colorMeta: { <slug>: { role, displayName, canonical: "oklch(...)", tonalRamp: [8 hex, dark to light] } }, typographyMeta, shadows: [ { name, value, purpose } ], motion: [ { name, value, purpose } ], breakpoints: [ { name, value } ] }, components: [ { name, kind, refersTo: "<frontmatter component key>", description, html, css } ], narrative: { northStar, overview, keyCharacteristics, rules: [ { name, body, section } ], dos, donts } }`

Components: 5-10 primitives (button-primary, button-secondary, button-ghost, input incl. error state, card, chip, nav bar, one signature component), `ds-` prefixed classes, self-contained CSS with literal values (no Tailwind, no `var()` since there is no page defining them yet), `:hover` and `:focus-visible` rules, inline SVG icons. Narrative copied verbatim from DESIGN.md.

## design/tokens.css

Generated: `node "${CLAUDE_PLUGIN_ROOT}/scripts/tokens-css.mjs"`. Emits `--color-<slug>`, `--font-<role>-family|size|weight|line-height|letter-spacing`, `--radius-<k>`, `--space-<k>` on `:root`, plus `.ds-<component>` recipes with token references resolved to custom properties. Developers scaffold from this file; DESIGN.md stays the narrative source.

## Components sheet in greenfield

`design/components/Cmp*.dc.html` are authored from the design.json snippets and tokens. Every component definition element carries `data-component-def="<Export>[/<variant>]"`, for example `<button data-component-def="Button/primary" ...>`. Flows then reference `data-component="design/components/CmpButtons.dc.html#Button/primary"`; `flow-check` verifies the definition exists. When code lands and `init --refresh` runs, `flow --extend` migrates these references to real file paths.

Suggested sheet: `CmpButtons`, `CmpInputs`, `CmpSelection`, `CmpCards`, `CmpOverlays`, `CmpTypography`, `CmpNavbar`, `CmpFooter`, `CmpColors` (swatch per token with hex, OKLCH and variable name).

## library.json in greenfield

```json
{ "greenfield": true, "intendedStack": "Next.js + Tailwind + shadcn (to be confirmed)",
  "canonical": ["design/components"], "legacy": [], "tokens": ["design/tokens.css", "DESIGN.md"],
  "icons": { "canonical": "inline SVG (lucide style)" }, "font": "<families>",
  "theme": { "dark": false, "designedThemes": ["light"] }, "direction": "<chosen direction name>",
  "directionsCanvas": "<url or null>", "componentsCanvas": null, "impeccable": "3.5.0", "createdAt": "<iso>" }
```
