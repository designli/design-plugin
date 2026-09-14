#!/usr/bin/env node
// Builds a portable bundle for a flow (or the components sheet): manifest.json + screens/*.html.
//   node bundle.mjs --flow design/flows/<slug> [--components design/components] [--out <dir>] [--json]
//   node bundle.mjs --components design/components --kind components [--out design/components/bundle] [--json]
// Screens are the flattened static renders produced by dc-to-html.mjs. Deterministic contentHash.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve, basename, relative } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const flowDir = opt("--flow") ? resolve(opt("--flow")) : null;
const compDir = opt("--components") ? resolve(opt("--components")) : null;
const kind = opt("--kind", flowDir ? "flow" : "components");
const srcDir = kind === "flow" ? flowDir : compDir;
if (!srcDir) { console.error("need --flow <dir> (or --components <dir> --kind components)"); process.exit(2); }
if (!existsSync(srcDir) || !readdirSync(srcDir).some(f => f.endsWith(".dc.html"))) { console.error(`no .dc.html sources in ${srcDir}`); process.exit(2); }
const out = resolve(opt("--out", join(srcDir, "bundle")));
const json = args.includes("--json");
const PLUGIN_VERSION = JSON.parse(readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8")).version;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const STATE_ORDER = ["Default", "Loading", "Empty", "Validation", "Submitting", "Error", "Success", "Disabled", "Selected", "Partial", "Stale"];
const STEM_RE = /^(\d{2})-([A-Z][A-Za-z0-9]*)-([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*?)(-Mobile)?$/;
export function parseStem(stem) { if (stem === "Main") return { n: "", stepId: "", state: "", device: "desktop", id: "Main" }; const m = stem.match(STEM_RE); if (!m) return null; return { n: m[1], stepId: m[2], state: m[3], device: m[4] ? "mobile" : "desktop", id: `${m[1]}-${m[2]}-${m[3]}` }; }
export function contentHashOf(entries) { const lines = entries.filter(e => e.path.startsWith("screens/")).map(e => `${e.path}=${e.sha256}`).sort().join("\n") + "\n"; return "sha256:" + sha(lines); }

// 1. flatten
mkdirSync(out, { recursive: true });
rmSync(join(out, "screens"), { recursive: true, force: true });
const dcArgs = kind === "flow"
  ? ["--flow", srcDir, ...(compDir ? ["--components", compDir] : []), "--out", join(out, "screens"), "--force"]
  : ["--flow", srcDir, "--components", srcDir, "--out", join(out, "screens"), "--force", "--include-components"];
const r = spawnSync(process.execPath, [new URL("./dc-to-html.mjs", import.meta.url).pathname, ...dcArgs], { encoding: "utf8" });
if (r.status !== 0) { process.stderr.write(r.stdout + r.stderr); console.error("flatten failed"); process.exit(1); }
if (!existsSync(join(out, "screens")) || !readdirSync(join(out, "screens")).some(f => f.endsWith(".html"))) { console.error("no screens were produced"); process.exit(1); }
const warnings = r.stdout.split("\n").filter(l => /problem/.test(l));

// 2. hash + manifest
const screenFiles = readdirSync(join(out, "screens")).filter(f => f.endsWith(".html")).sort();
const entries = screenFiles.map(f => ({ path: `screens/${f}`, sha256: sha(readFileSync(join(out, "screens", f))) }));
const contentHash = contentHashOf(entries);
const canvas = existsSync(join(srcDir, "canvas.json")) ? JSON.parse(readFileSync(join(srcDir, "canvas.json"), "utf8")) : { artboards: [] };
const dims = Object.fromEntries((canvas.artboards || []).map(a => [a.file.replace(/\.dc\.html$/, ""), a]));
let manifest;
if (kind === "flow") {
  const flow = JSON.parse(readFileSync(join(srcDir, "flow.json"), "utf8"));
  const devices = { desktop: flow.frame || { w: 1440, h: 900 } }; if ((flow.devices || []).includes("mobile")) devices.mobile = flow.mobileFrame || { w: 390, h: 844 };
  const screens = new Map();
  const interactive = new Set(flow.interactive || []);
  for (const f of screenFiles) {
    const stem = f.replace(/\.html$/, ""); const p = parseStem(stem); if (!p) { warnings.push(`skipped ${f}: not a screen stem`); continue; }
    const e = screens.get(p.id) || { id: p.id, kind: p.id === "Main" ? "map" : "state", title: p.id === "Main" ? "Flow map" : `${p.n} ${p.stepId} · ${p.state}`, step: p.n || null, stepId: p.stepId || null, state: p.state || null, interactive: interactive.has(p.id), devices: {} };
    const a = dims[stem] || {};
    e.devices[p.device] = { file: `screens/${f}`, w: a.w || (p.device === "mobile" ? devices.mobile?.w : devices.desktop.w) || 1440, h: a.h || 900, sha256: "sha256:" + entries.find(x => x.path === `screens/${f}`).sha256, source: `${stem}.dc.html`, layout: { x: a.x ?? 0, y: a.y ?? 0 } };
    screens.set(p.id, e);
  }
  const rank = (s) => s.id === "Main" ? "0" : `${s.step}-${String(STATE_ORDER.indexOf(s.state) < 0 ? 99 : STATE_ORDER.indexOf(s.state)).padStart(2, "0")}`;
  const steps = (flow.steps || []).map(s => ({ n: s.n, id: s.id, kind: s.kind, surface: s.surface, purpose: s.purpose, primaryAction: s.primaryAction, states: Object.entries(s.states || {}).map(([state, v]) => /^n\/a/.test(String(v)) ? { state, waived: String(v).replace(/^n\/a:\s*/, "") } : { state, screen: `${s.n}-${s.id}-${state}` }) }));
  const compHash = compDir && existsSync(join(compDir, "bundle", "manifest.json")) ? JSON.parse(readFileSync(join(compDir, "bundle", "manifest.json"), "utf8")).contentHash : null;
  manifest = { schema: 1, generator: `designli-design/${PLUGIN_VERSION}`, generatedAt: new Date().toISOString(), contentHash, kind: "flow", flow: { slug: flow.slug, title: flow.title, goal: flow.goal, status: flow.status, story: flow.story ?? null, prd: flow.prd, prototype: !!flow.prototype, sourceDir: relative(process.cwd(), srcDir) }, devices, defaultDevice: "desktop", entryPoints: flow.entryPoints || [], steps, screens: [...screens.values()].sort((a, b) => rank(a).localeCompare(rank(b))), transitions: flow.transitions || [], componentsHash: compHash, publish: flow.portal ? { target: "portal", ...flow.portal } : null };
} else {
  const screens = screenFiles.map(f => { const stem = f.replace(/\.html$/, ""); const a = dims[stem] || {}; return { id: stem, kind: "state", title: a.title || stem.replace(/^Cmp/, ""), step: null, stepId: null, state: null, interactive: false, devices: { desktop: { file: `screens/${f}`, w: a.w || 960, h: a.h || 720, sha256: "sha256:" + entries.find(x => x.path === `screens/${f}`).sha256, source: `${stem}.dc.html`, layout: { x: a.x ?? 0, y: a.y ?? 0 } } } }; });
  manifest = { schema: 1, generator: `designli-design/${PLUGIN_VERSION}`, generatedAt: new Date().toISOString(), contentHash, kind: "components", flow: { slug: "components", title: "Components", sourceDir: relative(process.cwd(), srcDir) }, devices: { desktop: { w: 960, h: 720 } }, defaultDevice: "desktop", entryPoints: [], steps: [], screens, transitions: [] };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
if (kind === "flow") { const fj = join(srcDir, "flow.json"); const flow = JSON.parse(readFileSync(fj, "utf8")); flow.bundle = { builtAt: manifest.generatedAt, contentHash, screens: manifest.screens.length }; writeFileSync(fj, JSON.stringify(flow, null, 2) + "\n"); }
const bytes = entries.reduce((n, e) => n + statSync(join(out, e.path)).size, 0);
const res = { ok: warnings.length === 0, out: relative(process.cwd(), out), kind, screens: manifest.screens.length, files: entries.length, bytes, contentHash, warnings };
if (bytes > 10 * 1024 * 1024) res.warnings.push(`bundle is ${(bytes / 1048576).toFixed(1)} MB; the portal refuses above 20 MB`);
console.log(json ? JSON.stringify(res) : `bundle: ${res.kind} ${res.screens} screens (${res.files} files, ${(bytes / 1024).toFixed(0)} KB) -> ${res.out}  ${contentHash}${warnings.length ? "\n  " + warnings.join("\n  ") : ""}`);
process.exit(warnings.some(w => /not found/.test(w)) ? 1 : 0);
