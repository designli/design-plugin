// Flow declarations (design/flows/<slug>/flow.json): reading, resolving states to files, gaps,
// scanning a prototype folder and proposing declarations for what is not declared yet.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, basename } from "node:path";
import {
  STATE_VOCAB,
  STEP_KINDS,
  REQUIRED_BY_KIND,
  isState,
  isStepId,
  screenIdOf,
  isSource,
  isDc,
  splitDevice,
  mobileSibling,
  sourcesIn,
  isSourceFile,
  scanFile,
  componentFile,
  componentId,
  readPrototype,
  readProduct,
  MAX_SOURCE_BYTES,
} from "./proto.mjs";

export const flowsDir = (project) => join(project, "design", "flows");
export const flowDirOf = (project, slug) => join(flowsDir(project), slug);
export function readFlow(dir) {
  const p = join(dir, "flow.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`${relative(process.cwd(), p)} is not valid JSON: ${e.message}`);
  }
}
export function writeFlow(dir, flow) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "flow.json"), JSON.stringify(flow, null, 2) + "\n");
}
/** Every declared flow: { slug, dir, flow }. */
export function listFlows(project) {
  const root = flowsDir(project);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((s) => statSync(join(root, s)).isDirectory() && existsSync(join(root, s, "flow.json")))
    .sort()
    .map((slug) => ({ slug, dir: join(root, slug), flow: readFlow(join(root, slug)) }));
}
/** `flow` may be a slug or a directory. */
export function resolveFlowDir(project, flow) {
  if (!flow)
    throw Object.assign(new Error("flow is required (a slug under design/flows)"), {
      code: "VALIDATION",
    });
  const p = existsSync(join(resolve(project, flow), "flow.json"))
    ? resolve(project, flow)
    : flowDirOf(project, flow);
  if (!existsSync(join(p, "flow.json")))
    throw Object.assign(new Error(`no flow.json under ${p}`), { code: "NOT_FOUND" });
  return p;
}

// ---- states → files ----
const isWaiver = (v) => typeof v === "string" && /^n\/a\b/i.test(v);
const waiverReason = (v) =>
  String(v)
    .replace(/^n\/a:?\s*/i, "")
    .trim();
/**
 * The devices a flow designs: what the flow says, else what its files show (a state with a mobile
 * file makes the flow a two-device flow), else desktop only.
 */
export function flowDevices(flow) {
  if (Array.isArray(flow.devices) && flow.devices.length) return flow.devices;
  if (flow.device === "both") return ["desktop", "mobile"];
  if (flow.device === "mobile") return ["mobile"];
  const anyMobile = (flow.steps || []).some((st) =>
    Object.values(st.states || {}).some((v) => v && typeof v === "object" && v.mobile),
  );
  return anyMobile ? ["desktop", "mobile"] : ["desktop"];
}
/**
 * Resolves every declared state of a flow to files. Returns steps with
 * states: { [name]: { status: present|waived|missing|optional, files?: {desktop?, mobile?}, reason?, screen } }.
 * A file makes a state present; a waiver only counts without a file.
 */
export function resolveStates(flow, dir) {
  const devices = flowDevices(flow);
  const steps = [];
  const problems = [];
  const usedFiles = new Map(); // abs file → screen id
  for (const st of flow.steps || []) {
    const required = new Set(REQUIRED_BY_KIND[st.kind] || ["Default"]);
    const states = {};
    const declared = st.states || {};
    for (const name of [
      ...STATE_VOCAB,
      ...Object.keys(declared).filter((n) => !STATE_VOCAB.includes(n)),
    ]) {
      const v = declared[name];
      const screen = screenIdOf(st.n, st.id, name);
      const isRequired = required.has(name);
      if (v === undefined || v === null || v === "") {
        states[name] = {
          status: isRequired ? "missing" : "optional",
          required: isRequired,
          screen,
        };
        continue;
      }
      if (isWaiver(v)) {
        const reason = waiverReason(v);
        if (!reason)
          problems.push({
            kind: "state-unwaived",
            step: st.n,
            state: name,
            where: `${st.n} ${name}`,
            message: `"n/a" without a reason`,
          });
        states[name] = { status: "waived", reason, required: isRequired, screen };
        continue;
      }
      const files = {};
      const spec = typeof v === "string" ? { desktop: v } : v;
      for (const dev of Object.keys(spec)) {
        if (!["desktop", "mobile"].includes(dev)) {
          problems.push({
            kind: "bad-name",
            step: st.n,
            state: name,
            where: `${st.n} ${name}`,
            message: `unknown device "${dev}"`,
          });
          continue;
        }
        const f = resolve(dir, spec[dev]);
        if (!existsSync(f)) {
          problems.push({
            kind: "broken-file",
            step: st.n,
            state: name,
            where: `${st.n} ${name}`,
            file: spec[dev],
            message: `${spec[dev]} does not exist`,
          });
          continue;
        }
        files[dev] = f;
      }
      // a desktop-only declaration in a two-device flow picks up the mobile sibling by name
      if (typeof v === "string" && devices.includes("mobile") && files.desktop && !files.mobile) {
        const sib = mobileSibling(files.desktop);
        if (sib) files.mobile = sib;
      }
      for (const [dev, f] of Object.entries(files)) {
        const prev = usedFiles.get(f);
        if (prev && prev !== screen)
          problems.push({
            kind: "duplicate-state",
            step: st.n,
            state: name,
            where: `${st.n} ${name}`,
            file: relative(dir, f),
            message: `${relative(dir, f)} is also ${prev}`,
          });
        usedFiles.set(f, screen);
        void dev;
      }
      states[name] = Object.keys(files).length
        ? { status: "present", files, required: isRequired, screen }
        : {
            status: isRequired ? "missing" : "optional",
            required: isRequired,
            screen,
            broken: true,
          };
    }
    steps.push({
      n: st.n,
      id: st.id,
      kind: st.kind,
      title: st.title,
      purpose: st.purpose,
      surface: st.surface,
      primaryAction: st.primaryAction,
      states,
    });
  }
  return { steps, problems, usedFiles, devices };
}

// ---- gaps ----
export const BLOCKING = new Set([
  "broken-file",
  "broken-include",
  "bad-name",
  "duplicate-state",
  "duplicate-step",
]);
export const STRICT = new Set([...BLOCKING, "state-missing", "state-unwaived", "no-product"]);
/** Everything that stands between the prototype and a clean publish or handoff. */
export function gapsOf(project, { flow: only, strict = false } = {}) {
  const proto = readPrototype(project);
  const compDirs = [resolve(project, proto.components)];
  const out = [];
  const push = (g) => out.push(g);
  if (!readProduct(project))
    push({
      flow: null,
      kind: "no-product",
      where: "design/prototype.json",
      proposal: "adopt asks for the product name and a one-line summary once",
    });
  const every = listFlows(project);
  const flows = every.filter((f) => !only || f.slug === only || f.dir === resolve(project, only));
  const slugs = new Set(every.map((f) => f.slug));
  for (const sk of scanPrototype(project).skipped) {
    const owner = every.find((f) => resolve(project, sk.file).startsWith(f.dir + "/"));
    if (only && owner?.slug !== only) continue;
    push({
      flow: owner?.slug ?? null,
      kind: "too-large",
      where: sk.file,
      proposal: `${(sk.bytes / 1048576).toFixed(1)} MB; screens above ${MAX_SOURCE_BYTES / 1048576} MB are not scanned or bundled: trim the inline asset or link it by URL`,
    });
  }
  for (const { slug, dir, flow } of flows) {
    const r = resolveStates(flow, dir);
    if (!Number.isInteger(flow.order))
      push({
        flow: slug,
        kind: "no-order",
        where: "flow.json",
        proposal: "set order (its place in the journey, 1 = first)",
      });
    if (!(flow.entryPoints || []).length)
      push({
        flow: slug,
        kind: "no-entry",
        where: "flow.json",
        proposal: "declare where users come from ({from, to: '01-Step'})",
      });
    for (const l of flow.next || [])
      if (!slugs.has(l.flow))
        push({
          flow: slug,
          kind: "broken-link",
          where: `next → ${l.flow}`,
          proposal: "point next at an existing flow slug",
        });
    const seenN = new Set();
    for (const st of flow.steps || []) {
      if (!/^\d{2}$/.test(String(st.n)) || !isStepId(String(st.id || "")))
        push({
          flow: slug,
          kind: "bad-name",
          where: `${st.n} ${st.id}`,
          proposal: "n is two digits, id is PascalCase ([A-Z][A-Za-z0-9]*)",
        });
      if (!STEP_KINDS.includes(st.kind))
        push({
          flow: slug,
          kind: "bad-name",
          where: `${st.n} ${st.id}`,
          proposal: `kind must be one of ${STEP_KINDS.join(", ")}`,
        });
      if (seenN.has(st.n))
        push({
          flow: slug,
          kind: "duplicate-step",
          where: `${st.n}`,
          proposal: "step numbers must be unique",
        });
      seenN.add(st.n);
      for (const name of Object.keys(st.states || {}))
        if (!isState(name))
          push({
            flow: slug,
            kind: "bad-name",
            where: `${st.n} ${name}`,
            proposal: `state names are ${STATE_VOCAB.join(", ")} or Custom-<Name>`,
          });
    }
    for (const p of r.problems)
      push({ flow: slug, kind: p.kind, where: p.where, file: p.file, proposal: p.message });
    for (const st of r.steps)
      for (const [name, v] of Object.entries(st.states))
        if (v.status === "missing" && !v.broken)
          push({
            flow: slug,
            kind: "state-missing",
            where: `${st.n} ${name}`,
            step: st.n,
            state: name,
            proposal: `design ${screenIdOf(st.n, st.id, name)} or waive it with a reason ("n/a: <fact>")`,
          });
    // files nobody declared
    const mapped = new Set([...r.usedFiles.keys()]);
    for (const f of sourcesIn(dir)) {
      const abs = join(dir, f);
      if (mapped.has(abs) || /^Main\.(dc\.)?html$/.test(f)) continue;
      push({
        flow: slug,
        kind: "unassigned-screen",
        where: f,
        file: f,
        proposal: "map it to a step and state in flow.json, or delete it",
      });
    }
    // links and includes
    for (const f of sourcesIn(dir)) {
      const s = scanFile(join(dir, f));
      for (const l of s.links)
        if (!existsSync(resolve(dir, l.href)))
          push({
            flow: slug,
            kind: "broken-link",
            where: `${f} → ${l.href}`,
            file: f,
            proposal: "link to an existing screen file",
          });
      for (const name of s.includes)
        if (!componentFile(name, [...compDirs, dir]))
          push({
            flow: slug,
            kind: "broken-include",
            where: `${f} → <dc-import name="${name}">`,
            file: f,
            proposal: `add ${proto.components}/${name}.html`,
          });
    }
    // transitions must name declared screens
    const ids = new Set(
      r.steps.flatMap((s) =>
        Object.values(s.states)
          .filter((v) => v.status === "present")
          .map((v) => v.screen),
      ),
    );
    for (const t of flow.transitions || [])
      for (const end of [t.from, t.to])
        if (!ids.has(end) && end !== "Main")
          push({
            flow: slug,
            kind: "broken-link",
            where: `transition ${t.from} → ${t.to}`,
            proposal: `${end} is not a designed screen of this flow`,
          });
  }
  const filtered = strict ? out.filter((g) => STRICT.has(g.kind)) : out;
  return {
    gaps: filtered,
    blocking: out.filter((g) => BLOCKING.has(g.kind)),
    flows: flows.map((f) => f.slug),
  };
}

// ---- scan and propose ----
const kebab = (s) =>
  String(s)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
const pascal = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // "Próximo" → "Proximo", not "PrXimo"
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
const STATE_LOWER = new Map(STATE_VOCAB.map((s) => [s.toLowerCase(), s]));
/** `02-details-validation` → { n: "02", stepId: "Details", state: "Validation" }; `client` → step Client, Default. */
export function guessStem(stem) {
  let s = stem;
  let n = null;
  const nm = s.match(/^(\d{1,2})[-_.\s]+(.*)$/);
  if (nm) {
    n = nm[1].padStart(2, "0");
    s = nm[2];
  }
  const tokens = s.split(/[-_.\s]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
  let state = "Default";
  let custom = null;
  const ci = tokens.findIndex((t, i) => i > 0 && t.toLowerCase() === "custom");
  if (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (STATE_LOWER.has(last.toLowerCase())) {
      state = STATE_LOWER.get(last.toLowerCase());
      tokens.pop();
    } else if (ci > 0 && ci < tokens.length - 1) {
      custom = "Custom-" + pascal(tokens.slice(ci + 1).join(" "));
      tokens.splice(ci);
    }
  }
  const stepId = pascal(tokens.join(" ")) || "Step";
  return { n, stepId, state: custom || state };
}
/** Scans a prototype: screens (with links and includes), components, declared flows, unassigned files. */
export function scanPrototype(project, { dir } = {}) {
  const proto = readPrototype(project);
  const root = resolve(project, dir || proto.dir || "design");
  const compDir = resolve(project, proto.components);
  const flows = listFlows(project);
  const declaredFiles = new Set();
  for (const f of flows)
    for (const k of resolveStates(f.flow, f.dir).usedFiles.keys()) declaredFiles.add(k);
  // screen candidates: every source under root (recursively, skipping components, bundle, dot dirs)
  const screens = [];
  const skipped = []; // sources above MAX_SOURCE_BYTES: reported, never silently ignored
  const walk = (d, depth) => {
    if (depth > 4 || !existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (/^\.|^bundle$|^node_modules$|^directions$|^png$/.test(e.name) || p === compDir)
          continue;
        walk(p, depth + 1);
      } else if (isSource(e.name) && !isSourceFile(p) && statSync(p).isFile()) {
        skipped.push({ file: relative(project, p), bytes: statSync(p).size });
      } else if (
        isSource(e.name) &&
        isSourceFile(p) &&
        !/^Cmp/.test(e.name) &&
        !/^Main\.(dc\.)?html$/.test(e.name)
      ) {
        const s = scanFile(p);
        const { stem, device } = splitDevice(e.name);
        screens.push({
          file: relative(project, p),
          dir: relative(project, d),
          stem,
          device: s.device || device,
          title: s.title,
          links: s.links.map((l) => ({
            ...l,
            file: relative(project, resolve(d, l.href)),
            exists: existsSync(resolve(d, l.href)),
          })),
          includes: s.includes,
          dataComponents: s.dataComponents,
          hasForm: s.hasForm,
          hasChoice: s.hasChoice,
          hasTable: s.hasTable,
          declared: declaredFiles.has(p),
        });
      }
    }
  };
  walk(root, 0);
  const components = sourcesIn(compDir).map((f) => {
    const name = f.replace(/\.dc\.html$/, "").replace(/\.html$/, "");
    return {
      name,
      id: componentId(name),
      file: relative(project, join(compDir, f)),
      usedBy: screens.filter((s) => s.includes.includes(name)).map((s) => s.file),
    };
  });
  return {
    dir: relative(project, root) || ".",
    prototype: {
      exists: proto.exists,
      devices: proto.devices,
      components: proto.components,
      product: proto.product ?? null,
    },
    product: readProduct(project),
    screens,
    skipped,
    components,
    flows: flows.map(({ slug, flow, dir }) => {
      const r = resolveStates(flow, dir);
      return {
        slug,
        title: flow.title,
        order: flow.order ?? null,
        steps: r.steps.length,
        screens: r.usedFiles.size,
        missing: r.steps.flatMap((s) =>
          Object.entries(s.states)
            .filter(([, v]) => v.status === "missing")
            .map(([k]) => `${s.n} ${k}`),
        ),
      };
    }),
    unassigned: screens.filter((s) => !s.declared).map((s) => s.file),
  };
}
/**
 * Proposes flows for the unassigned screens: one flow per folder, steps and states from file names,
 * transitions from links, entry points from files nothing links to. Pure inference, never writes.
 */
export function proposeFlows(project, scan = scanPrototype(project)) {
  const byDir = new Map();
  for (const s of scan.screens.filter((x) => !x.declared)) {
    const key = s.dir;
    if (!byDir.has(key)) byDir.set(key, []);
    byDir.get(key).push(s);
  }
  const flows = [];
  const questions = [];
  const existing = listFlows(project);
  let order = existing.length;
  for (const [dir, files] of byDir) {
    const inFlows =
      dir.startsWith(join("design", "flows") + "/") || dir.startsWith("design/flows/");
    const existingFlow = existing.find((f) => relative(project, f.dir) === dir);
    const slug =
      existingFlow?.slug ||
      kebab(
        basename(dir) === "design" || dir === "." ? scan.product?.name || "main" : basename(dir),
      );
    // group by step (stem without the state), keep the first-seen order and any leading number
    const steps = new Map();
    for (const f of files) {
      const g = guessStem(f.stem);
      const key = (g.n ? g.n + "-" : "") + g.stepId;
      if (!steps.has(key)) steps.set(key, { n: g.n, id: g.stepId, states: {}, files: [] });
      const st = steps.get(key);
      const cur = st.states[g.state];
      const relFile = relative(join(project, dir), join(project, f.file));
      if (f.device === "mobile")
        st.states[g.state] =
          typeof cur === "string"
            ? { desktop: cur, mobile: relFile }
            : { ...(cur || {}), mobile: relFile };
      else
        st.states[g.state] =
          cur && typeof cur === "object" ? { ...cur, desktop: relFile } : relFile;
      st.files.push(f);
    }
    // order: declared number, else by the link graph (a step nobody links to comes first), else name
    const linkedTo = new Set(files.flatMap((f) => f.links.map((l) => l.file)));
    const ordered = [...steps.values()].sort((a, b) => {
      if (a.n && b.n) return a.n.localeCompare(b.n);
      if (a.n || b.n) return a.n ? -1 : 1;
      const ai = a.files.some((f) => !linkedTo.has(f.file)) ? 0 : 1;
      const bi = b.files.some((f) => !linkedTo.has(f.file)) ? 0 : 1;
      return ai - bi || a.id.localeCompare(b.id);
    });
    let i = 0;
    const idToN = new Map();
    const stepsOut = ordered.map((st) => {
      i++;
      const n = st.n || String(i).padStart(2, "0");
      // an explicit number that collides gets renumbered in sequence
      const nn = idToN.has(n) ? String(i).padStart(2, "0") : n;
      idToN.set(nn, st.id);
      const isLast = i === ordered.length;
      const anyForm = st.files.some((f) => f.hasForm);
      const anyChoice = st.files.some((f) => f.hasChoice);
      const anyTable = st.files.some((f) => f.hasTable);
      const hasSuccess = "Success" in st.states;
      const hasSubmitting = "Submitting" in st.states;
      const kind =
        hasSuccess && hasSubmitting && !anyForm
          ? "confirmation"
          : isLast && hasSuccess
            ? "result"
            : anyForm
              ? "form"
              : anyChoice
                ? "choice"
                : anyTable
                  ? "data"
                  : "info";
      const proposal = {
        n: nn,
        id: st.id,
        kind,
        purpose: st.files.find((f) => f.title)?.title || "",
        states: st.states,
      };
      const req = REQUIRED_BY_KIND[kind];
      const missing = req.filter((s) => !(s in st.states));
      questions.push({
        flow: slug,
        field: `steps.${nn}.kind`,
        proposal: kind,
        options: STEP_KINDS,
        why: `guessed from the markup (${anyForm ? "data entry" : anyChoice ? "a pick among options" : hasSubmitting && hasSuccess ? "submitting and success states" : anyTable ? "a table or list" : "static content"})`,
      });
      if (missing.length)
        questions.push({
          flow: slug,
          field: `steps.${nn}.states`,
          proposal: Object.fromEntries(missing.map((m) => [m, "n/a: ?"])),
          options: ["design them", "waive with a reason"],
          why: `required for a ${kind} step: ${missing.join(", ")}`,
        });
      return { ...proposal, _files: st.files };
    });
    // transitions from links: file → screen id
    const fileToId = new Map();
    for (const st of stepsOut)
      for (const [state, v] of Object.entries(st.states))
        for (const rel of typeof v === "string" ? [v] : Object.values(v))
          fileToId.set(join(project, dir, rel), screenIdOf(st.n, st.id, state));
    const transitions = [];
    for (const st of stepsOut)
      for (const f of st._files)
        for (const l of f.links) {
          const from = fileToId.get(join(project, f.file));
          const to = fileToId.get(join(project, l.file));
          if (!from || !to || from === to) continue;
          if (!transitions.some((t) => t.from === from && t.to === to && t.on === l.label))
            transitions.push({ from, on: l.label || "?", to });
        }
    // a step nobody else leads to is where users come in (transitions inside a step do not count)
    const stepOf = (id) => id.replace(/-[^-]+$/, "");
    const targets = new Set(
      transitions.filter((t) => stepOf(t.from) !== stepOf(t.to)).map((t) => stepOf(t.to)),
    );
    const entryPoints = stepsOut
      .filter((st) => !targets.has(`${st.n}-${st.id}`))
      .slice(0, 1)
      .map((st) => ({ from: "?", to: `${st.n}-${st.id}` }));
    order++;
    const devices = ["desktop", "mobile"].filter((d) => files.some((f) => f.device === d));
    const flowOut = {
      slug,
      devices,
      title: existingFlow?.flow.title || pascal(slug).replace(/([a-z])([A-Z])/g, "$1 $2"),
      goal: existingFlow?.flow.goal || "",
      order: existingFlow?.flow.order ?? order,
      next: existingFlow?.flow.next || [],
      entryPoints: existingFlow?.flow.entryPoints?.length
        ? existingFlow.flow.entryPoints
        : entryPoints,
      steps: stepsOut.map(({ _files, ...s }) => s),
      transitions,
      dir,
      new: !existingFlow,
      inFlowsDir: inFlows,
    };
    questions.unshift({
      flow: slug,
      field: "title",
      proposal: flowOut.title,
      options: [],
      why: "from the folder name",
    });
    if (!flowOut.goal)
      questions.push({
        flow: slug,
        field: "goal",
        proposal: "",
        options: [],
        why: "one sentence: what the user achieves",
      });
    if (entryPoints.some((e) => e.from === "?"))
      questions.push({
        flow: slug,
        field: "entryPoints",
        proposal: entryPoints,
        options: ["a navbar item", "a dashboard action", "an email link", "another flow"],
        why: "where users come from",
      });
    if (!inFlows)
      questions.push({
        flow: slug,
        field: "dir",
        proposal: `design/flows/${slug}`,
        options: ["move the files there", "keep them where they are"],
        why: "flows live under design/flows/<slug> so publish finds them",
      });
    flows.push(flowOut);
  }
  if (!scan.product)
    questions.unshift({
      flow: null,
      field: "product",
      proposal: { name: "", summary: "" },
      options: [],
      why: "shown on the portal's project page and in every handoff",
    });
  return { flows, questions, unassigned: scan.unassigned, components: scan.components };
}
/** Writes flow.json files (merging over existing ones) and design/prototype.json. Returns gaps. */
export function writeFlows(project, { flows = [], prototype = null } = {}) {
  const written = [];
  if (prototype) {
    const cur = readPrototype(project);
    const { exists, ...base } = cur;
    const next = { ...base, ...prototype, schema: 1, source: "static" };
    if (next.product && !next.product.name) delete next.product;
    mkdirSync(join(project, "design"), { recursive: true });
    writeFileSync(join(project, "design", "prototype.json"), JSON.stringify(next, null, 2) + "\n");
    written.push("design/prototype.json");
  }
  for (const f of flows) {
    if (!f.slug || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(f.slug))
      throw Object.assign(new Error(`invalid slug "${f.slug}" (kebab-case, 2-61 chars)`), {
        code: "VALIDATION",
      });
    const dir = flowDirOf(project, f.slug);
    const cur = readFlow(dir) || { schema: 2, slug: f.slug, status: "draft", reviews: [] };
    const steps = (f.steps || []).map((s) => {
      const st = {
        n: String(s.n).padStart(2, "0"),
        id: s.id,
        kind: s.kind,
        ...(s.title ? { title: s.title } : {}),
        ...(s.surface ? { surface: s.surface } : {}),
        ...(s.purpose ? { purpose: s.purpose } : {}),
        ...(s.primaryAction ? { primaryAction: s.primaryAction } : {}),
        states: {},
      };
      for (const [name, v] of Object.entries(s.states || {})) {
        if (!isState(name))
          throw Object.assign(
            new Error(
              `${f.slug} ${st.n}: "${name}" is not a state (${STATE_VOCAB.join(", ")} or Custom-<Name>)`,
            ),
            { code: "VALIDATION" },
          );
        if (v === undefined || v === null || v === "") continue;
        st.states[name] = v;
      }
      if (!STEP_KINDS.includes(st.kind))
        throw Object.assign(
          new Error(`${f.slug} ${st.n}: kind "${st.kind}" is not one of ${STEP_KINDS.join(", ")}`),
          { code: "VALIDATION" },
        );
      if (!isStepId(st.id))
        throw Object.assign(new Error(`${f.slug} ${st.n}: id "${st.id}" must be PascalCase`), {
          code: "VALIDATION",
        });
      return st;
    });
    const next = {
      ...cur,
      schema: 2,
      slug: f.slug,
      title: f.title ?? cur.title ?? f.slug,
      goal: f.goal ?? cur.goal ?? "",
      order: Number.isInteger(f.order) ? f.order : (cur.order ?? null),
      next: f.next ?? cur.next ?? [],
      entryPoints: f.entryPoints ?? cur.entryPoints ?? [],
      steps: steps.length ? steps : cur.steps || [],
      transitions: f.transitions ?? cur.transitions ?? [],
      ...(f.devices ? { devices: f.devices } : {}),
    };
    delete next.device;
    delete next.frame;
    delete next.mobileFrame;
    delete next.artifact;
    writeFlow(dir, next);
    written.push(relative(project, join(dir, "flow.json")));
  }
  return { written, ...gapsOf(project) };
}
