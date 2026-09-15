#!/usr/bin/env node
// Doctor for every designli-design verb.
//   node preflight.mjs [--project <dir>] [--require setup,impeccable,dna,library] [--json]
// Prints { ok, blockers:[{code,message,fix}], warnings:[...], info:{...} }.
// Blockers depend on --require; everything else is reported as info/warnings.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { checkInstall, IMPECCABLE_PIN } from "./install-impeccable.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const project = resolve(opt("--project", process.cwd()));
const require_ = new Set((opt("--require", "") || "").split(",").filter(Boolean));
const json = args.includes("--json");

const blockers = [],
  warnings = [],
  info = { project, node: process.versions.node, impeccablePin: IMPECCABLE_PIN };
const block = (code, message, fix) => blockers.push({ code, message, fix });
const warn = (code, message, fix) => warnings.push({ code, message, fix });

// Node
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 12))
  block("NODE", `Node ${process.versions.node} is below 22.12`, "nvm install 24 && nvm use 24");
else if (maj < 24)
  warn(
    "NODE",
    `Node ${process.versions.node}; 24 is what the plugin is tested on`,
    "nvm install 24",
  );

// impeccable
const imp = checkInstall(project);
info.impeccable = imp;
if (imp.status !== "OK") {
  const msg =
    imp.status === "MISSING"
      ? "impeccable is not installed in this project"
      : imp.status === "VERSION_MISMATCH"
        ? `impeccable ${imp.installed} is installed but ${imp.pinned} is pinned`
        : `impeccable install has ${imp.drift.length} modified/missing files`;
  (require_.has("impeccable") ? block : warn)(
    "IMPECCABLE_" + imp.status,
    msg,
    "run /designli-design:init (or: node <plugin>/scripts/install-impeccable.mjs --project . --force)",
  );
}

// Design DNA
const dna = {
  PRODUCT: existsSync(join(project, "PRODUCT.md")),
  DESIGN: existsSync(join(project, "DESIGN.md")),
  designJson: existsSync(join(project, ".impeccable", "design.json")),
};
info.dna = dna;
if (!(dna.PRODUCT && dna.DESIGN && dna.designJson)) {
  const missing = Object.entries(dna)
    .filter(([, v]) => !v)
    .map(([k]) => k)
    .join(", ");
  (require_.has("dna") ? block : warn)(
    "DNA_MISSING",
    `design DNA incomplete (missing: ${missing})`,
    "run /designli-design:init",
  );
}

// Library + design dir
const lib = join(project, "design", "library.json");
info.library = existsSync(lib) ? JSON.parse(readFileSync(lib, "utf8")) : null;
if (!info.library)
  (require_.has("library") ? block : warn)(
    "LIBRARY_MISSING",
    "design/library.json not found",
    "run /designli-design:init",
  );
info.flows = existsSync(join(project, "design", "flows"))
  ? execSync("ls", { cwd: join(project, "design", "flows"), encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
  : [];

// Publish target (informational; never prints token values)
info.publish = {
  target: (info.library && info.library.publish && info.library.publish.target) || "local",
  portal:
    info.library && info.library.publish && info.library.publish.portal
      ? { url: info.library.publish.portal.url, projectId: info.library.publish.portal.projectId }
      : null,
  tokenSource: process.env.DESIGNLI_PORTAL_TOKEN
    ? "env"
    : existsSync(join(process.env.HOME || "", ".config", "designli-design", "credentials.json"))
      ? "credentials"
      : null,
};
if (info.publish.target === "portal" && !info.publish.tokenSource)
  warn(
    "PORTAL_TOKEN",
    "publish target is portal but no token is configured",
    "run node <plugin>/scripts/setup.mjs (or export DESIGNLI_PORTAL_TOKEN before starting the agent)",
  );
// Connection to the portal: setup writes publish.portal and the harness config
info.harness = (info.library && info.library.harness) || null;
info.mcpJson = existsSync(join(project, ".mcp.json"));
if (!info.library || !info.library.publish)
  (require_.has("setup") ? block : warn)(
    "SETUP",
    "this repository is not connected to a portal project yet",
    "run node <plugin>/scripts/setup.mjs (or the setup prompt of the designli-design MCP server)",
  );
if (info.mcpJson) {
  const text = readFileSync(join(project, ".mcp.json"), "utf8");
  if (/dpat_[A-Za-z0-9_-]{8,}/.test(text))
    warn(
      "TOKEN_IN_REPO",
      ".mcp.json contains a literal personal access token",
      "revoke it on the portal's Account page and reference ${DESIGNLI_PORTAL_TOKEN} instead",
    );
}
if (
  info.publish.target === "portal" &&
  info.publish.portal &&
  /^http:\/\//.test(info.publish.portal.url || "") &&
  !/^http:\/\/(localhost|127\.0\.0\.1)/.test(info.publish.portal.url)
)
  warn(
    "PORTAL_HTTP",
    "the portal url is plain http; the token would travel unencrypted",
    "use https",
  );

// Git state (informational)
try {
  info.gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: project,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  info.gitDirty = execSync("git status --porcelain", {
    cwd: project,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split("\n")
    .filter(Boolean).length;
} catch {
  info.gitBranch = null;
}
if (existsSync(join(project, ".specs")))
  warn(
    "SPECS_DIR",
    "a legacy .specs/ folder exists next to ./specs/",
    "keep using ./specs/; the designli-skills pipeline is being aligned on ./specs/",
  );

// Greenfield detection: no UI source files outside tooling dirs
function hasUiSource(dir, depth = 0) {
  if (depth > 4) return false;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (
        [
          "node_modules",
          ".git",
          "design",
          "specs",
          ".claude",
          ".impeccable",
          ".next",
          "dist",
          "build",
        ].includes(e.name)
      )
        continue;
      if (hasUiSource(join(dir, e.name), depth + 1)) return true;
    } else if (/\.(tsx|jsx|vue|svelte|astro|html|css)$/.test(e.name) && !/\.dc\.html$/.test(e.name))
      return true;
  }
  return false;
}
info.greenfield = !hasUiSource(project);
if (info.greenfield)
  warn(
    "GREENFIELD",
    "no UI source files found: this is a greenfield project, init will create the design system from a direction instead of reading code",
    "run /designli-design:init (greenfield path)",
  );

// Frontend framework hint
const pkg = join(project, "package.json");
if (existsSync(pkg)) {
  const p = JSON.parse(readFileSync(pkg, "utf8"));
  const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
  info.framework = deps.next ? `next ${deps.next}` : deps.react ? `react ${deps.react}` : "unknown";
  info.tailwind = deps.tailwindcss || null;
  info.shadcn = existsSync(join(project, "components.json"));
  info.mui = Boolean(deps["@mui/material"]);
}

const out = { ok: blockers.length === 0, blockers, warnings, info };
if (json) console.log(JSON.stringify(out, null, 2));
else {
  console.log(out.ok ? "preflight OK" : "preflight BLOCKED");
  for (const b of blockers) console.log(`  BLOCKER ${b.code}: ${b.message}\n    fix: ${b.fix}`);
  for (const w of warnings) console.log(`  warning ${w.code}: ${w.message}\n    fix: ${w.fix}`);
  console.log(
    `  node ${info.node}, impeccable ${imp.status}, DNA ${dna.PRODUCT && dna.DESIGN && dna.designJson ? "present" : "incomplete"}, library ${info.library ? "present" : "missing"}, flows: ${info.flows.join(", ") || "none"}`,
  );
}
process.exit(out.ok ? 0 : 1);
