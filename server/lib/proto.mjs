// The static-HTML prototype: what a screen file is, what it links to, what it includes, and how it
// flattens into one self-contained document. Pure functions over files; nothing here talks to the
// portal. Both plain `.html` documents and design-canvas `.dc.html` artboards are accepted.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname, resolve, relative, extname } from "node:path";

export const STATE_VOCAB = [
  "Default",
  "Loading",
  "Empty",
  "Validation",
  "Submitting",
  "Error",
  "Success",
  "Disabled",
  "Selected",
  "Partial",
  "Stale",
];
export const STEP_KINDS = ["form", "data", "choice", "confirmation", "result", "info"];
export const REQUIRED_BY_KIND = {
  form: ["Default", "Validation", "Submitting", "Error"],
  data: ["Default", "Loading", "Empty", "Error"],
  choice: ["Default", "Loading", "Error"],
  confirmation: ["Default", "Submitting", "Error", "Success"],
  result: ["Default", "Success"],
  info: ["Default"],
};
export const isState = (s) => STATE_VOCAB.includes(s) || /^Custom-[A-Za-z0-9]+$/.test(s);
export const isStepId = (s) => /^[A-Z][A-Za-z0-9]*$/.test(s);
export const screenIdOf = (n, stepId, state) => `${n}-${stepId}-${state}`;
export const SCREEN_ID_RE = /^(Main|Cmp[A-Za-z0-9]+|\d{2}-[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+)$/;

/** Is this file a screen source? Plain `.html` and `.dc.html`; never build output. */
export const isSource = (f) => /\.html$/i.test(f) && !/^\./.test(f);
export const isDc = (f) => /\.dc\.html$/i.test(f);
/** `client-error-m.html` → { stem: "client-error", device: "mobile" }. */
export function splitDevice(file) {
  const stem = basename(file)
    .replace(/\.dc\.html$/i, "")
    .replace(/\.html$/i, "");
  const m = stem.match(/^(.*?)(?:[-_.](?:Mobile|mobile|m|M))$/);
  return m ? { stem: m[1], device: "mobile" } : { stem, device: "desktop" };
}
/** The mobile sibling of a desktop file, if one exists (any of the accepted suffixes). */
export function mobileSibling(file) {
  const dir = dirname(file);
  const { stem } = splitDevice(file);
  const dc = isDc(file);
  const ext = dc ? ".dc.html" : ".html";
  for (const suf of dc ? ["-Mobile"] : ["-mobile", "-m", ".mobile", "_mobile", "-Mobile"]) {
    const p = join(dir, stem + suf + ext);
    if (existsSync(p)) return p;
  }
  return null;
}
/** A screen is never megabytes; a seeded canvas or an export is, and is not a source. */
export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
export const isSourceFile = (path) => {
  try {
    const st = statSync(path);
    return st.isFile() && st.size <= MAX_SOURCE_BYTES;
  } catch {
    return false;
  }
};
/** Files under a directory that are screen sources (not recursive; `bundle/` and dot dirs skipped). */
export function sourcesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => isSource(f) && isSourceFile(join(dir, f)))
    .sort();
}

// ---- parsing ----
const decode = (s) =>
  String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
export const textOf = (html) =>
  decode(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[1] ?? m[2] ?? m[3]) : undefined;
};
const isLocalHref = (h) =>
  !!h &&
  !/^(https?:|mailto:|tel:|javascript:|data:|#|\/)/i.test(h) &&
  /\.html(?:[?#].*)?$/i.test(h);
/** What a screen file says about itself: title, includes, local links (transitions), tags. */
export function parseScreen(src) {
  const includes = [];
  for (const m of src.matchAll(/<dc-import\b([^>]*)>/g)) {
    const name = attr(m[1], "name");
    if (name && !includes.includes(name)) includes.push(name);
  }
  const links = [];
  for (const m of src.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[1], "href");
    if (!isLocalHref(href)) continue;
    const label = attr(m[1], "data-on") || textOf(m[2]).slice(0, 80);
    links.push({ href: href.replace(/[?#].*$/, ""), label, kind: "a" });
  }
  for (const m of src.matchAll(/<([a-z0-9]+)\b([^>]*\bdata-goto\s*=[^>]*)>/gi)) {
    const href = attr(m[2], "data-goto");
    if (!isLocalHref(href)) continue;
    const label = attr(m[2], "data-on") || attr(m[2], "aria-label") || "";
    links.push({ href: href.replace(/[?#].*$/, ""), label, kind: m[1].toLowerCase() });
  }
  const dataComponents = [
    ...new Set([...src.matchAll(/\bdata-component\s*=\s*"([^"]+)"/g)].map((m) => m[1])),
  ];
  const title =
    (src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() ||
    textOf((src.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") ||
    "";
  const device = (src.match(/<meta\s+name="designli-device"\s+content="([^"]+)"/i) || [])[1];
  // data entry (text-like inputs) is a form; radios, checkboxes and selects alone are a choice
  const hasForm =
    /<textarea\b/i.test(src) ||
    /<input\b(?![^>]*\btype\s*=\s*"?(radio|checkbox|hidden|submit|button)\b)[^>]*>/i.test(src);
  const hasChoice =
    !hasForm && /<input\b[^>]*\btype\s*=\s*"?(radio|checkbox)\b|<select\b/i.test(src);
  const hasTable = /<(table|tbody)\b/i.test(src) || (src.match(/<li\b/gi) || []).length >= 6;
  return {
    title: decode(title),
    includes,
    links,
    dataComponents,
    device,
    hasForm,
    hasChoice,
    hasTable,
  };
}
export const scanFile = (file) => ({ file, ...parseScreen(readFileSync(file, "utf8")) });

// ---- flattening ----
const dcParts = (src) => ({
  helmet: (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ""])[1],
  body: (src.match(/<x-dc>([\s\S]*?)<\/x-dc>/) || [, ""])[1].replace(
    /<helmet>[\s\S]*?<\/helmet>/,
    "",
  ),
});
/**
 * A plain component file: its <head> styles, links and external scripts (a pinned Tailwind or
 * font loader) are hoisted, its <body> (or all of it) inlined.
 */
const htmlParts = (src) => {
  const head = (src.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || [, ""])[1];
  const body = (src.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) || [])[1];
  const helmet = [
    ...head.matchAll(
      /<(?:style\b[\s\S]*?<\/style|link\b[^>]*|script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script)>/gi,
    ),
  ]
    .map((m) => m[0])
    .join("\n");
  return { helmet, body: body ?? src.replace(/<!doctype[^>]*>/i, "") };
};
/** The hoistable head part and the body of a component file, whatever its flavour. */
export const componentParts = (file) =>
  isDc(file) ? dcParts(readFileSync(file, "utf8")) : htmlParts(readFileSync(file, "utf8"));
/** Resolves an include name to a file: `<name>.html`, then `<name>.dc.html`, in each directory. */
export function componentFile(name, dirs) {
  for (const d of dirs.filter(Boolean))
    for (const f of [`${name}.html`, `${name}.dc.html`])
      if (existsSync(join(d, f))) return join(d, f);
  return null;
}
/** The include's canonical id on the portal: `Cmp<Name>`. */
export const componentId = (name) =>
  /^Cmp/.test(name) ? name : "Cmp" + name.replace(/[^A-Za-z0-9]/g, "");

/**
 * Flattens one screen source into a self-contained document.
 *  - `.dc.html`: helmet hoisted, <x-dc> unwrapped, data-flat holes resolved, includes inlined
 *  - `.html`: includes inlined (their styles hoisted), local links rewritten through `linkMap`
 * Deterministic: no timestamps, so a rebuild of unchanged sources gives the same hash.
 */
export function flatten(file, { componentDirs = [], linkMap = new Map(), project } = {}) {
  const src = readFileSync(file, "utf8");
  const includes = [];
  const missing = [];
  const heads = [];
  const dirs = [...componentDirs, dirname(file)];
  const inline = (m, attrs) => {
    const name = attr(attrs, "name");
    const cf = name && componentFile(name, dirs);
    if (!cf) {
      missing.push(name || "(unnamed)");
      return `<!-- dc-import ${name} not found -->`;
    }
    if (!includes.includes(name)) includes.push(name);
    const c = isDc(cf) ? dcParts(readFileSync(cf, "utf8")) : htmlParts(readFileSync(cf, "utf8"));
    if (c.helmet && !heads.includes(c.helmet)) heads.push(c.helmet);
    return `<!-- begin ${name} --><div data-imported-component="${name}">${c.body}</div><!-- end ${name} -->`;
  };
  const IMPORT_RE = /<dc-import\b([^>]*?)(?:\/>|>\s*<\/dc-import>)/g;
  // an include may import another (Header → Logo): resolve until nothing is left, a few levels deep
  const inlineAll = (text) => {
    for (let depth = 0; depth < 6 && IMPORT_RE.test(text); depth++) {
      IMPORT_RE.lastIndex = 0;
      text = text.replace(IMPORT_RE, inline);
    }
    IMPORT_RE.lastIndex = 0;
    return text;
  };
  const rel = project ? relative(project, file) : basename(file);
  if (isDc(file)) {
    const p = dcParts(src);
    if (!p.body) throw new Error(`${basename(file)}: no <x-dc> root`);
    heads.push(p.helmet);
    let body = inlineAll(p.body);
    // interactive artboards: render the static (Default) variant from data-flat
    const scriptTag = (body.match(/<script[^>]*data-dc-script[^>]*>/) ||
      src.match(/<script[^>]*data-dc-script[^>]*>/) || [""])[0];
    const flatRaw = (scriptTag.match(/data-flat='([^']*)'/) ||
      scriptTag.match(/data-flat="([^"]*)"/) ||
      [])[1];
    let flat = {};
    if (flatRaw) {
      try {
        flat = JSON.parse(decode(flatRaw));
      } catch {
        missing.push("data-flat (invalid JSON)");
      }
    }
    const lookup = (path) =>
      path
        .split(".")
        .reduce((o, k) => (o && typeof o === "object" && k in o ? o[k] : undefined), flat);
    body = body.replace(/<script[^>]*data-dc-script[\s\S]*?<\/script>/g, "");
    body = body.replace(/\s+on[A-Z][A-Za-z]*="\{\{[^}]*\}\}"/g, "");
    for (let i = 0; i < 6; i++) {
      const before = body;
      body = body.replace(
        /<sc-if\b([^>]*)>((?:(?!<sc-if\b)[\s\S])*?)<\/sc-if>/g,
        (m, attrs, inner) => {
          const v = (attrs.match(/value="\{\{\s*([^}\s]+)\s*\}\}"/) || [])[1];
          const val = v === "true" ? true : v === "false" ? false : v ? lookup(v) : true;
          return val ? inner : "";
        },
      );
      if (body === before) break;
    }
    body = body.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, p) => {
      const v = lookup(p);
      if (v === undefined) {
        missing.push("hole " + p);
        return "";
      }
      return String(v);
    });
    body = body.replace(/\s+hint-[a-z-]+="[^"]*"/g, "");
    const stem = basename(file).replace(/\.dc\.html$/, "");
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${stem}</title>
<!-- generated by designli-design from ${rel}; do not edit, edit the .dc.html source and re-run handoff -->
${heads.join("\n")}
</head>
<body>
${body}
</body>
</html>
`;
    return { html, includes, missing };
  }
  // plain document
  let html = inlineAll(src);
  if (heads.length) {
    const block = heads.join("\n") + "\n";
    html = /<\/head>/i.test(html)
      ? html.replace(/<\/head>/i, block + "</head>")
      : html.replace(/<body\b/i, `<head>\n${block}</head>\n<body`);
  }
  if (linkMap.size) {
    const dir = dirname(file);
    const rewrite = (h) => {
      const clean = h.replace(/[?#].*$/, "");
      if (!isLocalHref(clean)) return null;
      const target = resolve(dir, clean);
      return linkMap.get(target) ?? null;
    };
    html = html.replace(/(<a\b[^>]*\bhref\s*=\s*")([^"]*)(")/gi, (m, a, h, b) => {
      const r = rewrite(h);
      return r ? a + r + b : m;
    });
    html = html.replace(/(\bdata-goto\s*=\s*")([^"]*)(")/gi, (m, a, h, b) => {
      const r = rewrite(h);
      return r ? a + r + b : m;
    });
  }
  const banner = `<!-- generated by designli-design from ${rel}; edit the source, not this file -->`;
  html = /<head\b[^>]*>/i.test(html)
    ? html.replace(/(<head\b[^>]*>)/i, `$1\n${banner}`)
    : banner + "\n" + html;
  return { html, includes, missing };
}

// ---- prototype.json ----
export const DEFAULT_DEVICES = { desktop: { w: 1440, h: 900 }, mobile: { w: 390, h: 844 } };
export function readPrototype(project) {
  const p = join(project, "design", "prototype.json");
  const base = {
    schema: 1,
    source: "static",
    dir: "design",
    components: "design/components",
    devices: DEFAULT_DEVICES,
  };
  if (!existsSync(p)) return { ...base, exists: false };
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return { ...base, ...j, devices: { ...DEFAULT_DEVICES, ...(j.devices || {}) }, exists: true };
  } catch (e) {
    throw new Error(`design/prototype.json is not valid JSON: ${e.message}`);
  }
}
/** Product basics: prototype.json.product, else PRODUCT.md (impeccable's shape: "## Product Purpose" starting "<Name> is ..."). */
export function readProduct(project) {
  const proto = readPrototype(project);
  if (proto.product?.name) return proto.product;
  const p = join(project, "PRODUCT.md");
  if (!existsSync(p)) return null;
  const md = readFileSync(p, "utf8");
  const section = (title) =>
    (md.match(new RegExp(`^##\\s+${title}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s|\\s*$)`, "mi")) || [])[1];
  const para = (s) =>
    (s || "")
      .split(/\n\s*\n/)
      .map((x) => x.replace(/\s+/g, " ").trim())
      .find((x) => x && !x.startsWith("[") && !x.startsWith("#"));
  const purpose = para(section("Product Purpose")) || para(section("Overview"));
  const h1 = (md.match(/^#\s+(.+)$/m) || [])[1]?.trim();
  const generic = !h1 || /^(product|product\.md|untitled)$/i.test(h1);
  const fromPurpose = (purpose || "").match(
    /^([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})\s+(?:is|are|helps|lets|gives)\b/,
  );
  const name = generic ? fromPurpose?.[1] : h1;
  if (!name) return null;
  return { name: name.slice(0, 120), ...(purpose ? { summary: purpose.slice(0, 1000) } : {}) };
}
