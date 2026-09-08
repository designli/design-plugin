#!/usr/bin/env node
// Gate for flows: states coverage, token/component drift, naming grammar, secrets.
//   node flow-check.mjs --flow design/flows/<slug> [--project <dir>] [--strict] [--json]
//   node flow-check.mjs --design-only [--project <dir>] [--json]
// Exit 0 when there are no errors (in --strict, coverage gaps and drift are errors).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const project = resolve(opt("--project", process.cwd()));
const flowDir = opt("--flow", null) ? resolve(opt("--flow")) : null;
const strict = args.includes("--strict");
const json = args.includes("--json");
const designOnly = args.includes("--design-only");

const errors = [], warnings = [];
const err = (code, message, where) => errors.push({ code, message, where });
const warn = (code, message, where) => warnings.push({ code, message, where });
const gap = strict ? err : warn; // coverage/drift gaps escalate in strict mode

// ---------- states vocabulary ----------
export const STATE_VOCAB = ["Default", "Loading", "Empty", "Validation", "Submitting", "Error", "Success", "Disabled", "Selected", "Partial", "Stale"];
export const REQUIRED_BY_KIND = {
  form: ["Default", "Validation", "Submitting", "Error"],
  data: ["Default", "Loading", "Empty", "Error"],
  choice: ["Default", "Loading", "Error"],
  confirmation: ["Default", "Submitting", "Error", "Success"],
  result: ["Default", "Success"],
  info: ["Default"],
};
const isState = (s) => STATE_VOCAB.includes(s) || /^Custom-[A-Za-z0-9]+$/.test(s);
const isWaiver = (v) => typeof v === "string" && /^n\/a:\s*\S/.test(v);
const isEmptyWaiver = (v) => typeof v === "string" && /^n\/a:?\s*$/.test(v);

// ---------- design DNA / tokens ----------
const allowColors = new Set(["#ffffff", "#000000", "transparent", "currentcolor", "inherit", "initial", "unset", "none"]);
function normHex(h) {
  h = h.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) return "#" + [...h.slice(1)].map(c => c + c).join("");
  if (/^#[0-9a-f]{4}$/.test(h)) return "#" + [...h.slice(1, 4)].map(c => c + c).join("");
  if (/^#[0-9a-f]{8}$/.test(h)) return h.slice(0, 7);
  return h;
}
function rgbToHex(r, g, b) { return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
function hslToHex(h, s, l) {
  s /= 100; l /= 100; const k = n => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(255 * f(0), 255 * f(8), 255 * f(4));
}
function toHex(literal) {
  const v = literal.trim().toLowerCase();
  if (v.startsWith("#")) return normHex(v);
  let m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/); if (m) return rgbToHex(+m[1], +m[2], +m[3]);
  m = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/); if (m) return hslToHex(+m[1], +m[2], +m[3]);
  return null; // oklch etc.: compared as raw strings
}
function collectStrings(obj, out = []) {
  if (typeof obj === "string") out.push(obj);
  else if (Array.isArray(obj)) obj.forEach(v => collectStrings(v, out));
  else if (obj && typeof obj === "object") Object.values(obj).forEach(v => collectStrings(v, out));
  return out;
}
async function loadTokens() {
  const tokens = { colors: new Set(allowColors), fonts: new Set(["system-ui", "sans-serif", "serif", "monospace", "ui-sans-serif", "ui-monospace", "inherit"]), raw: new Set(), sections: [], model: null };
  const designMd = join(project, "DESIGN.md");
  if (!existsSync(designMd)) return tokens;
  const md = readFileSync(designMd, "utf8");
  let model = null;
  const parserPath = join(project, ".claude", "skills", "impeccable", "scripts", "design-parser.mjs");
  if (existsSync(parserPath)) {
    try { const mod = await import(pathToFileURL(parserPath).href); model = mod.parseDesignMd(md); } catch (e) { warn("PARSER", `design-parser.mjs failed: ${e.message}`); }
  }
  tokens.model = model;
  // colors: every hex/rgb/hsl string anywhere in frontmatter + prose, plus design.json ramps
  const sources = [md];
  const dj = join(project, ".impeccable", "design.json");
  if (existsSync(dj)) sources.push(readFileSync(dj, "utf8"));
  if (model?.frontmatter) sources.push(collectStrings(model.frontmatter).join("\n"));
  for (const s of sources) {
    for (const m of s.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/g)) {
      const hex = toHex(m[0]); if (hex) tokens.colors.add(hex); else tokens.raw.add(m[0].replace(/\s+/g, "").toLowerCase());
    }
  }
  // fonts: any quoted family or "font-family" line in DESIGN.md / frontmatter
  for (const m of md.matchAll(/(?:font(?:-family)?|fontFamily|family)\s*[:=]\s*["']?([A-Za-z][A-Za-z0-9 \-]*)/g)) tokens.fonts.add(m[1].trim().toLowerCase());
  if (model?.frontmatter) for (const s of collectStrings(model.frontmatter)) if (/^[A-Z][A-Za-z ]{2,30}$/.test(s)) tokens.fonts.add(s.toLowerCase());
  tokens.sections = (md.match(/^##\s+.*$/gm) || []).map(l => l.replace(/^##\s+/, "").replace(/^\d+\.\s*/, "").trim());
  return tokens;
}

// ---------- design-only checks ----------
function checkDesign(tokens) {
  if (!existsSync(join(project, "DESIGN.md"))) return err("DESIGN_MISSING", "DESIGN.md not found", "DESIGN.md");
  const want = ["Overview", "Colors", "Typography", "Elevation", "Components", "Do's and Don'ts"];
  const have = tokens.sections;
  const order = want.map(w => have.findIndex(h => h.toLowerCase().startsWith(w.toLowerCase())));
  if (order.some(i => i < 0)) err("DESIGN_SECTIONS", `DESIGN.md is missing sections: ${want.filter((_, i) => order[i] < 0).join(", ")}`, "DESIGN.md");
  else if (order.some((v, i) => i > 0 && v < order[i - 1])) warn("DESIGN_ORDER", "DESIGN.md sections are out of the canonical order", "DESIGN.md");
  if (tokens.model && !tokens.model.frontmatter) err("DESIGN_FRONTMATTER", "DESIGN.md has no parsable YAML frontmatter", "DESIGN.md");
  if (tokens.colors.size <= allowColors.size) err("DESIGN_COLORS", "no color tokens found in DESIGN.md / design.json", "DESIGN.md");
  const dj = join(project, ".impeccable", "design.json");
  if (!existsSync(dj)) err("DESIGNJSON_MISSING", ".impeccable/design.json not found", ".impeccable/design.json");
  else {
    try { const d = JSON.parse(readFileSync(dj, "utf8")); const n = Array.isArray(d.components) ? d.components.length : Object.keys(d.components || {}).length; if (!n) warn("DESIGNJSON_COMPONENTS", "design.json has no components", dj); }
    catch (e) { err("DESIGNJSON_PARSE", e.message, dj); }
  }
  const lib = join(project, "design", "library.json");
  if (!existsSync(lib)) warn("LIBRARY_MISSING", "design/library.json not found", lib);
}

// ---------- artboard content checks ----------
const SECRET_RE = /(sk_(live|test)_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|password\s*=\s*\S+|[A-Za-z0-9._%+-]+@(?!example\.(com|org|net)|test\.com|vitalknowledge\.test)[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
function checkArtboard(file, tokens, { screen }) {
  const name = basename(file), src = readFileSync(file, "utf8");
  if (!src.includes('<script src="./support.js"></script>')) err("ARTBOARD_SUPPORT", 'missing the exact <script src="./support.js"></script> head line', name);
  if (!/<x-dc>[\s\S]*<\/x-dc>/.test(src)) err("ARTBOARD_XDC", "missing <x-dc> root", name);
  if (screen) {
    if (/\{\{/.test(src)) err("ARTBOARD_BINDING", "screen-state artboards must be literal markup (no {{bindings}})", name);
    if (/<sc-(for|if)\b/.test(src)) err("ARTBOARD_LOGIC", "screen-state artboards must not use <sc-for>/<sc-if>", name);
    if (/<script[^>]*data-dc-script/.test(src)) err("ARTBOARD_SCRIPT", "screen-state artboards must be static (no data-dc-script)", name);
  }
  for (const m of src.matchAll(/<dc-import\b([^>]*)>/g)) {
    const nm = (m[1].match(/name="([^"]+)"/) || [])[1] || "";
    if (!/^Cmp[A-Za-z0-9]+$/.test(nm)) err("IMPORT_NAME", `<dc-import name="${nm}"> must be a Cmp* component artboard`, name);
    if (!/hint-size=/.test(m[1])) warn("IMPORT_HINT", `<dc-import name="${nm}"> has no hint-size`, name);
  }
  if (/<dc-import\b[^>]*\/>/.test(src)) err("IMPORT_SELFCLOSE", "<dc-import> must not be self-closed", name);
  const secret = src.match(SECRET_RE); if (secret) err("SECRET", `possible secret or real email: ${secret[0].slice(0, 40)}`, name);
  // colors + fonts per tag (skip data-external tags), plus <style> blocks
  const unknownColors = new Map(), unknownFonts = new Set();
  const scanCss = (css, where) => {
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/g)) {
      const hex = toHex(m[0]); const key = hex || m[0].replace(/\s+/g, "").toLowerCase();
      const known = hex ? tokens.colors.has(hex) : tokens.raw.has(key);
      if (!known) unknownColors.set(key, (unknownColors.get(key) || 0) + 1);
    }
    for (const m of css.matchAll(/font-family\s*:\s*([^;"]+)/g)) {
      const first = m[1].split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
      if (first && !tokens.fonts.has(first)) unknownFonts.add(first);
    }
  };
  for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) scanCss(m[1], "style");
  for (const m of src.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const tag = m[0]; if (/data-external=/.test(tag)) continue;
    const st = tag.match(/\sstyle="([^"]*)"/); if (st) scanCss(st[1], "inline");
    const dc = tag.match(/data-component="([^"]+)"/);
    if (dc) {
      const [p, rest] = dc[1].split("#"); const exp = (rest || "").split("/")[0];
      if (/^@mui\//.test(p)) { if (!/data-legacy="true"/.test(tag)) err("MUI_COMPONENT", `data-component="${dc[1]}" targets MUI without data-legacy="true"`, name); }
      else if (!existsSync(join(project, p))) gap("COMPONENT_PATH", `data-component path does not exist: ${p}`, name);
      else if (exp) { const code = readFileSync(join(project, p), "utf8"); if (!new RegExp(`\\b${exp}\\b`).test(code)) gap("COMPONENT_EXPORT", `export ${exp} not found in ${p}`, name); }
    }
  }
  if (tokens.colors.size > allowColors.size) for (const [c, n] of unknownColors) gap("TOKEN_DRIFT", `color ${c} (${n}x) is not a token in DESIGN.md / design.json`, name);
  if (tokens.fonts.size > 7) for (const f of unknownFonts) gap("FONT_DRIFT", `font-family "${f}" is not in DESIGN.md`, name);
}

// ---------- flow checks ----------
function checkFlow(tokens) {
  const fj = join(flowDir, "flow.json");
  if (!existsSync(fj)) return err("FLOW_MISSING", "flow.json not found", fj);
  let flow; try { flow = JSON.parse(readFileSync(fj, "utf8")); } catch (e) { return err("FLOW_PARSE", e.message, fj); }
  for (const k of ["slug", "title", "steps"]) if (!flow[k]) err("FLOW_FIELD", `flow.json missing "${k}"`, "flow.json");
  const files = readdirSync(flowDir).filter(f => f.endsWith(".dc.html"));
  const referenced = new Set(["Main.dc.html"]);
  if (!files.includes("Main.dc.html")) err("MAIN_MISSING", "Main.dc.html (flow map) not found", flowDir);
  const coverage = {}; // "NN" -> { StepId, kind, states: {State: 'file'|'n/a'} }
  for (const step of flow.steps || []) {
    const n = String(step.n || "").padStart(2, "0"), id = step.id || "", kind = step.kind || "";
    const where = `step ${n} ${id}`;
    if (!/^\d{2}$/.test(n)) err("STEP_N", "step.n must be a two-digit number", where);
    if (!/^[A-Z][A-Za-z0-9]*$/.test(id)) err("STEP_ID", "step.id must be PascalCase without spaces or hyphens", where);
    if (!REQUIRED_BY_KIND[kind]) err("STEP_KIND", `step.kind "${kind}" is not one of ${Object.keys(REQUIRED_BY_KIND).join(", ")}`, where);
    coverage[n] = { id, kind, states: {} };
    for (const [state, val] of Object.entries(step.states || {})) {
      if (!isState(state)) err("STATE_NAME", `state "${state}" is not in the vocabulary (${STATE_VOCAB.join(", ")}, Custom-*)`, where);
      if (isWaiver(val)) { coverage[n].states[state] = "n/a"; continue; }
      if (isEmptyWaiver(val)) { err("WAIVER_REASON", `state ${state} is waived without a reason`, where); continue; }
      const expected = `${n}-${id}-${state}.dc.html`;
      if (val !== expected) err("STATE_FILE", `state ${state} must point at ${expected} (got ${val})`, where);
      if (!files.includes(expected)) err("STATE_FILE_MISSING", `${expected} does not exist`, where);
      referenced.add(expected); coverage[n].states[state] = "file";
    }
    for (const req of REQUIRED_BY_KIND[kind] || []) if (!coverage[n].states[req]) gap("COVERAGE", `required state ${req} for kind ${kind} is neither designed nor waived`, where);
  }
  for (const f of files) {
    if (referenced.has(f) || /^Cmp[A-Za-z0-9]+\.dc\.html$/.test(f)) continue;
    if (/^\d{2}-[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+\.dc\.html$/.test(f)) warn("ORPHAN", `${f} is not referenced by flow.json`, f);
    else err("ARTBOARD_NAME", `${f} does not follow NN-StepId-State.dc.html`, f);
  }
  for (const f of files) checkArtboard(join(flowDir, f), tokens, { screen: /^\d{2}-/.test(f) });
  // canvas.json
  const cj = join(flowDir, "canvas.json");
  if (!existsSync(cj)) err("CANVAS_MISSING", "canvas.json not found", flowDir);
  else {
    try {
      const c = JSON.parse(readFileSync(cj, "utf8"));
      const listed = new Set((c.artboards || []).map(a => a.file));
      for (const f of files) if (!listed.has(f)) gap("CANVAS_UNLISTED", `${f} is not laid out in canvas.json`, "canvas.json");
      for (const a of c.artboards || []) if (!files.includes(a.file) && !/^Cmp/.test(a.file)) err("CANVAS_GHOST", `canvas.json lists ${a.file} which does not exist here`, "canvas.json");
      const pageIds = new Set((c.pages || []).map(p => p.id));
      if (c.pages && !(pageIds.has("flow"))) warn("CANVAS_PAGES", 'pages should include { id: "flow" }', "canvas.json");
      const ids = new Set();
      for (const note of c.annotations || []) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(note.id || "")) err("NOTE_ID", `annotation id "${note.id}" is invalid`, "canvas.json");
        if (ids.has(note.id)) err("NOTE_DUP", `annotation id "${note.id}" repeats`, "canvas.json"); ids.add(note.id);
        if (c.pages && note.page && !pageIds.has(note.page)) err("NOTE_PAGE", `annotation ${note.id} names unknown page ${note.page}`, "canvas.json");
      }
      if (c.launch && c.launch.view !== "canvas" && c.launch.view !== "focused") err("LAUNCH", "launch.view must be canvas or focused", "canvas.json");
    } catch (e) { err("CANVAS_PARSE", e.message, cj); }
  }
  // design-flow.md
  const df = join(flowDir, "design-flow.md");
  if (!existsSync(df)) { gap("SPEC_MISSING", "design-flow.md not found", flowDir); return; }
  const md = readFileSync(df, "utf8");
  const H1 = ["Flow", "Entry Points", "Steps", "Screen States", "Transitions and Decisions", "Copy", "Data", "Edge Cases", "Accessibility", "Components Used", "Design References", "States Coverage", "Open Questions", "Review log"];
  const have = new Set((md.match(/^#\s+(.+)$/gm) || []).map(l => l.replace(/^#\s+/, "").trim().toLowerCase()));
  for (const h of H1) if (!have.has(h.toLowerCase())) gap("SPEC_SECTION", `design-flow.md is missing "# ${h}"`, "design-flow.md");
  const cov = md.split(/^#\s+States Coverage\s*$/m)[1]?.split(/^#\s+/m)[0] || "";
  const rows = cov.split("\n").filter(l => /^\|/.test(l));
  if (rows.length < 3) gap("COVERAGE_TABLE", "States Coverage table is missing or empty", "design-flow.md");
  else {
    const header = rows[0].split("|").slice(1, -1).map(s => s.trim());
    for (const row of rows.slice(2)) {
      const cells = row.split("|").slice(1, -1).map(s => s.trim());
      const stepLabel = cells[0] || "?"; const n = (stepLabel.match(/^(\d{2})/) || [])[1];
      cells.slice(1).forEach((cell, i) => {
        const state = header[i + 1];
        if (cell === "[ ]" || cell === "") gap("COVERAGE_GAP", `${stepLabel} / ${state} is not covered`, "design-flow.md");
        else if (/^n\/a:?\s*$/.test(cell)) err("COVERAGE_REASON", `${stepLabel} / ${state} is waived without a reason`, "design-flow.md");
        else if (cell === "[x]" && n && coverage[n] && coverage[n].states[state] !== "file") gap("COVERAGE_MISMATCH", `${stepLabel} / ${state} is [x] but no artboard exists in flow.json`, "design-flow.md");
      });
    }
  }
  if (strict && !(flow.artifact && flow.artifact.url) && !args.includes("--allow-local")) err("ARTIFACT_URL", "flow.json has no published canvas url (use --allow-local to hand off a local-only canvas)", "flow.json");
}

const tokens = await loadTokens();
if (designOnly || !flowDir) checkDesign(tokens);
if (flowDir) { if (!existsSync(flowDir)) err("FLOW_DIR", "flow directory not found", flowDir); else checkFlow(tokens); }
const out = { ok: errors.length === 0, strict, errors, warnings, tokens: { colors: tokens.colors.size - allowColors.size, fonts: [...tokens.fonts].filter(f => !["system-ui","sans-serif","serif","monospace","ui-sans-serif","ui-monospace","inherit"].includes(f)) } };
if (json) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`flow-check ${out.ok ? "OK" : "FAILED"}${strict ? " (strict)" : ""}: ${errors.length} errors, ${warnings.length} warnings; ${out.tokens.colors} color tokens known`);
  for (const e of errors) console.log(`  ERROR ${e.code} [${e.where}]: ${e.message}`);
  for (const w of warnings) console.log(`  warn  ${w.code} [${w.where}]: ${w.message}`);
}
process.exit(out.ok ? 0 : 1);
