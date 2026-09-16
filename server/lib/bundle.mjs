// Builds the bundle the portal validates: flattened screens plus manifest.json with the content
// hash. Screens are named by their canonical id (NN-StepId-State[-Mobile].html) whatever the source
// file was called, so the portal, comments and copy edits address stable ids.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve, relative, basename } from "node:path";
import { createHash } from "node:crypto";
import { PLUGIN_VERSION } from "./setup.mjs";
import {
  STATE_VOCAB,
  flatten,
  sourcesIn,
  isDc,
  componentId,
  readPrototype,
  readProduct,
  scanFile,
} from "./proto.mjs";
import { readFlow, writeFlow, resolveStates, resolveFlowDir } from "./flows.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
export function contentHashOf(entries) {
  const lines =
    entries
      .filter((e) => e.path.startsWith("screens/"))
      .map((e) => `${e.path}=${e.sha256}`)
      .sort()
      .join("\n") + "\n";
  return "sha256:" + sha(lines);
}
const wrapFragment = (html, title) =>
  /<html\b/i.test(html)
    ? html
    : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
const readCanvas = (dir) => {
  const p = join(dir, "canvas.json");
  if (!existsSync(p)) return {};
  try {
    return Object.fromEntries(
      (JSON.parse(readFileSync(p, "utf8")).artboards || []).map((a) => [
        a.file.replace(/\.dc\.html$/, "").replace(/\.html$/, ""),
        a,
      ]),
    );
  } catch {
    return {};
  }
};
const generator = () => `designli-design/${PLUGIN_VERSION}`;

/**
 * Bundles one flow into <dir>/bundle. Returns { manifest, files, entries, errors, warnings, out }.
 * Errors (a broken file or include) make the bundle unusable; warnings do not.
 */
export function buildFlowBundle(project, flowRef, { out, dry = false } = {}) {
  const dir = resolveFlowDir(project, flowRef);
  const flow = readFlow(dir);
  const proto = readPrototype(project);
  const compDir = resolve(project, proto.components);
  const outDir = resolve(out || join(dir, "bundle"));
  const r = resolveStates(flow, dir);
  const errors = r.problems
    .filter((p) => p.kind !== "state-unwaived")
    .map((p) => `${p.where}: ${p.message}`);
  const warnings = r.problems
    .filter((p) => p.kind === "state-unwaived")
    .map((p) => `${p.where}: ${p.message}`);
  // source file → the screen file it becomes, so links between sources become links between screens
  const linkMap = new Map();
  const targets = []; // { id, device, src, out }
  for (const st of r.steps)
    for (const [state, v] of Object.entries(st.states)) {
      if (v.status !== "present") continue;
      for (const [dev, src] of Object.entries(v.files)) {
        const outName = `${v.screen}${dev === "mobile" ? "-Mobile" : ""}.html`;
        linkMap.set(src, outName);
        targets.push({ id: v.screen, device: dev, src, out: outName, step: st, state });
      }
    }
  const mainFile = ["Main.dc.html", "Main.html"].map((f) => join(dir, f)).find(existsSync);
  if (mainFile)
    targets.unshift({ id: "Main", device: "desktop", src: mainFile, out: "Main.html", main: true });
  if (!dry) {
    mkdirSync(outDir, { recursive: true });
    rmSync(join(outDir, "screens"), { recursive: true, force: true });
    mkdirSync(join(outDir, "screens"), { recursive: true });
  }
  const entries = [];
  const contents = new Map();
  const screens = new Map();
  const dims = readCanvas(dir);
  const inferred = [];
  for (const t of targets) {
    let flat;
    try {
      flat = flatten(t.src, { componentDirs: [compDir], linkMap, project });
    } catch (e) {
      errors.push(`${relative(dir, t.src)}: ${e.message}`);
      continue;
    }
    for (const m of flat.missing) errors.push(`${relative(dir, t.src)}: include ${m} not found`);
    const html = wrapFragment(flat.html, t.id);
    if (!dry) writeFileSync(join(outDir, "screens", t.out), html);
    const digest = sha(html);
    entries.push({ path: `screens/${t.out}`, sha256: digest });
    contents.set(`screens/${t.out}`, html);
    const a =
      dims[
        basename(t.src)
          .replace(/\.dc\.html$/, "")
          .replace(/\.html$/, "")
      ] || {};
    const frame = proto.devices[t.device] || proto.devices.desktop;
    const e = screens.get(t.id) || {
      id: t.id,
      kind: t.main ? "map" : "state",
      title: t.main ? "Flow map" : `${t.step.n} ${t.step.title || t.step.id} · ${t.state}`,
      step: t.main ? null : t.step.n,
      stepId: t.main ? null : t.step.id,
      state: t.main ? null : t.state,
      interactive: (flow.interactive || []).includes(t.id),
      includes: [],
      devices: {},
    };
    for (const name of flat.includes) {
      const id = componentId(name);
      if (!e.includes.includes(id)) e.includes.push(id);
    }
    e.devices[t.device] = {
      file: `screens/${t.out}`,
      w: a.w || frame.w,
      h: a.h || frame.h,
      sha256: "sha256:" + digest,
      source: relative(dir, t.src),
      layout: { x: a.x ?? 0, y: a.y ?? 0 },
    };
    screens.set(t.id, e);
    if (!t.main && !isDc(t.src))
      for (const l of scanFile(t.src).links) {
        const to = linkMap.get(resolve(dir, l.href));
        const toId = to && to.replace(/(-Mobile)?\.html$/, "");
        if (toId && toId !== t.id) inferred.push({ from: t.id, on: l.label || "", to: toId });
      }
  }
  const rank = (s) =>
    s.id === "Main"
      ? "0"
      : `${s.step}-${String(Math.max(STATE_VOCAB.indexOf(s.state), 0)).padStart(2, "0")}`;
  const known = new Set(screens.keys());
  const transitions = [...(flow.transitions || [])];
  for (const t of inferred)
    if (
      known.has(t.from) &&
      known.has(t.to) &&
      !transitions.some((x) => x.from === t.from && x.to === t.to && (x.on === t.on || !t.on))
    )
      transitions.push(t);
  const steps = r.steps.map((s) => ({
    n: s.n,
    id: s.id,
    kind: s.kind,
    ...(s.surface ? { surface: s.surface } : {}),
    ...(s.purpose ? { purpose: s.purpose } : {}),
    ...(s.primaryAction ? { primaryAction: s.primaryAction } : {}),
    states: Object.entries(s.states)
      .filter(([, v]) => v.status === "present" || v.status === "waived")
      .map(([state, v]) =>
        v.status === "present" ? { state, screen: v.screen } : { state, waived: v.reason || "n/a" },
      ),
  }));
  const compHash = existsSync(join(compDir, "bundle", "manifest.json"))
    ? JSON.parse(readFileSync(join(compDir, "bundle", "manifest.json"), "utf8")).contentHash
    : null;
  const devices = { desktop: proto.devices.desktop };
  if (r.devices.includes("mobile")) devices.mobile = proto.devices.mobile;
  const contentHash = contentHashOf(entries);
  const manifest = {
    schema: 1,
    generator: generator(),
    generatedAt: new Date().toISOString(),
    contentHash,
    kind: "flow",
    flow: {
      slug: flow.slug,
      title: flow.title,
      goal: flow.goal,
      status: flow.status,
      story: flow.story ?? null,
      ...(flow.prd ? { prd: flow.prd } : {}),
      prototype: !!flow.prototype,
      sourceDir: relative(project, dir),
      order: Number.isInteger(flow.order) ? flow.order : null,
      next: Array.isArray(flow.next)
        ? flow.next
            .filter((l) => l && typeof l.flow === "string")
            .map((l) => ({ flow: l.flow, on: String(l.on ?? "") }))
        : [],
    },
    devices,
    defaultDevice: "desktop",
    entryPoints: flow.entryPoints || [],
    steps,
    screens: [...screens.values()].sort((a, b) => rank(a).localeCompare(rank(b))),
    transitions,
    componentsHash: compHash,
    publish: flow.portal ? { target: "portal", ...flow.portal } : null,
    product: readProduct(project),
  };
  if (!manifest.screens.length) errors.push("no screens: no state maps to an existing file");
  if (!dry) {
    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    if (!errors.length) {
      const fj = readFlow(dir);
      fj.bundle = { builtAt: manifest.generatedAt, contentHash, screens: manifest.screens.length };
      writeFlow(dir, fj);
    }
  }
  const files = entries.map((e) => ({
    path: e.path,
    encoding: "utf8",
    content: contents.get(e.path),
  }));
  const bytes = files.reduce((n, f) => n + Buffer.byteLength(f.content), 0);
  if (bytes > 10 * 1024 * 1024)
    warnings.push(`bundle is ${(bytes / 1048576).toFixed(1)} MB; the portal refuses above 20 MB`);
  return {
    ok: errors.length === 0,
    dir,
    out: relative(project, outDir),
    slug: flow.slug,
    manifest,
    files,
    entries,
    contentHash,
    screens: manifest.screens.length,
    bytes,
    errors,
    warnings,
  };
}

/** Bundles the includes as the project's components library (one screen per include). */
export function buildComponentsBundle(project, { out } = {}) {
  const proto = readPrototype(project);
  const compDir = resolve(project, proto.components);
  const sources = sourcesIn(compDir);
  if (!sources.length)
    return {
      ok: false,
      empty: true,
      errors: [`no components under ${proto.components}`],
      warnings: [],
    };
  const outDir = resolve(out || join(compDir, "bundle"));
  mkdirSync(join(outDir, "screens"), { recursive: true });
  rmSync(join(outDir, "screens"), { recursive: true, force: true });
  mkdirSync(join(outDir, "screens"), { recursive: true });
  const dims = readCanvas(compDir);
  const entries = [];
  const screens = [];
  const errors = [];
  for (const f of sources) {
    const name = f.replace(/\.dc\.html$/, "").replace(/\.html$/, "");
    const id = componentId(name);
    let flat;
    try {
      flat = flatten(join(compDir, f), { componentDirs: [compDir], project });
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
      continue;
    }
    const html = wrapFragment(flat.html, name);
    writeFileSync(join(outDir, "screens", `${id}.html`), html);
    const digest = sha(html);
    entries.push({ path: `screens/${id}.html`, sha256: digest });
    const a = dims[name] || {};
    screens.push({
      id,
      kind: "state",
      title: a.title || name.replace(/^Cmp/, ""),
      step: null,
      stepId: null,
      state: null,
      interactive: false,
      includes: [],
      devices: {
        desktop: {
          file: `screens/${id}.html`,
          w: a.w || 960,
          h: a.h || 720,
          sha256: "sha256:" + digest,
          source: f,
          layout: { x: a.x ?? 0, y: a.y ?? 0 },
        },
      },
    });
  }
  const contentHash = contentHashOf(entries);
  const manifest = {
    schema: 1,
    generator: generator(),
    generatedAt: new Date().toISOString(),
    contentHash,
    kind: "components",
    flow: {
      slug: "components",
      title: "Components",
      sourceDir: relative(project, compDir),
      order: null,
      next: [],
    },
    devices: { desktop: { w: 960, h: 720 } },
    defaultDevice: "desktop",
    entryPoints: [],
    steps: [],
    screens,
    transitions: [],
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const files = entries.map((e) => ({
    path: e.path,
    encoding: "utf8",
    content: readFileSync(join(outDir, e.path), "utf8"),
  }));
  return {
    ok: errors.length === 0,
    out: relative(project, outDir),
    manifest,
    files,
    entries,
    contentHash,
    screens: screens.length,
    errors,
    warnings: [],
  };
}
/** Whether the bundle on disk is older than any source (a cheap "needs rebuild"). */
export function bundleStale(dir) {
  const m = join(dir, "bundle", "manifest.json");
  if (!existsSync(m)) return true;
  const t = statSync(m).mtimeMs;
  return readdirSync(dir).some(
    (f) => (/\.html$/.test(f) || f === "canvas.json") && statSync(join(dir, f)).mtimeMs > t,
  );
}
