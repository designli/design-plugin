#!/usr/bin/env node
// Seeds a design canvas for a flow (or the components sheet) with the built-in design skill's helper.
//   node seed-flow.mjs --skill-dir <design skill base dir> --flow design/flows/<slug> --title "<Design Name>" --out design/flows/<slug>/<slug>.html [--components design/components]
//   node seed-flow.mjs --skill-dir <dir> --flow design/components --title "<Product> Components" --out design/components/<product>-components.html
// Merges component artboards onto a "components" page, runs seed-canvas.mjs, then --check.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const skillDir = opt("--skill-dir") && resolve(opt("--skill-dir"));
const flowDir = opt("--flow") && resolve(opt("--flow"));
const compDir = opt("--components") ? resolve(opt("--components")) : null;
const out = opt("--out") && resolve(opt("--out"));
const title = opt("--title");
if (!skillDir || !flowDir || !out || !title) { console.error("need --skill-dir, --flow, --out, --title"); process.exit(2); }
const helper = join(skillDir, "seed-canvas.mjs"), template = join(skillDir, "payload.template.html");
if (!existsSync(helper) || !existsSync(template)) { console.error(`design skill helper not found in ${skillDir}; invoke /design once in this session to learn the base directory`); process.exit(2); }

const flowBoards = readdirSync(flowDir).filter(f => f.endsWith(".dc.html")).sort();
const compBoards = compDir && compDir !== flowDir ? readdirSync(compDir).filter(f => /^Cmp[A-Za-z0-9]+\.dc\.html$/.test(f)).sort() : [];
const artboards = [...flowBoards.map(f => join(flowDir, f)), ...compBoards.map(f => join(compDir, f))];
const images = readdirSync(flowDir).filter(f => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(f)).map(f => join(flowDir, f));

let canvasPath = existsSync(join(flowDir, "canvas.json")) ? join(flowDir, "canvas.json") : null;
if (canvasPath && compBoards.length) {
  const c = JSON.parse(readFileSync(canvasPath, "utf8"));
  c.pages = c.pages || [{ id: "flow", name: "Flow" }];
  if (!c.pages.some(p => p.id === "components")) c.pages.push({ id: "components", name: "Components" });
  c.artboards = c.artboards || [];
  const listed = new Set(c.artboards.map(a => a.file));
  let x = 0;
  for (const f of compBoards) {
    if (listed.has(f)) continue;
    c.artboards.push({ file: f, x, y: 0, w: 960, h: 720, page: "components", title: f.replace(/\.dc\.html$/, "").replace(/^Cmp/, "") });
    x += 960 + 120;
  }
  for (const a of c.artboards) if (!a.page) a.page = "flow";
  for (const n of c.annotations || []) if (!n.page) n.page = "flow";
  c.launch = c.launch || { view: "canvas", page: "flow" };
  if (c.launch.view === "canvas" && !c.launch.page) c.launch.page = "flow";
  const seedDir = join(flowDir, ".seed"); mkdirSync(seedDir, { recursive: true });
  canvasPath = join(seedDir, "canvas.json"); writeFileSync(canvasPath, JSON.stringify(c, null, 2) + "\n");
}

const cmd = ["--template", template, "--out", out, "--title", title];
for (const a of artboards) cmd.push("--artboard", a);
for (const i of images) cmd.push("--image", i);
if (canvasPath) cmd.push("--canvas", canvasPath);
const r = spawnSync(process.execPath, [helper, ...cmd], { encoding: "utf8" });
process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || "");
if (r.status !== 0) { console.error("seed failed"); process.exit(r.status || 1); }
const c = spawnSync(process.execPath, [helper, "--check", out], { encoding: "utf8" });
process.stdout.write(c.stdout || ""); process.stderr.write(c.stderr || "");
if (c.status !== 0) { console.error("check failed"); process.exit(c.status || 1); }
console.log(`seed-flow: ${artboards.length} artboards (${compBoards.length} components), ${images.length} images -> ${relative(process.cwd(), out)}`);
