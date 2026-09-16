#!/usr/bin/env node
// Installs (or checks) the pinned impeccable build into a product repo.
//
//   node install-impeccable.mjs --project <dir>            install if missing/mismatched
//   node install-impeccable.mjs --project <dir> --force    always rewrite
//   node install-impeccable.mjs --project <dir> --check    report only, exit 1 unless OK
//   node install-impeccable.mjs --project <dir> --json     machine-readable output
//   node install-impeccable.mjs --project <dir> --harness none   ignore blocks only (no .claude/ files)
//
// Writes: <project>/.claude/skills/impeccable/**, <project>/.claude/agents/impeccable-*.md,
//         <project>/.claude/skills/impeccable/.designli-pin.json,
//         .gitignore / .prettierignore entries, .claude/settings.json merges.
// Never touches product source, PRODUCT.md, DESIGN.md or .impeccable/.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
  cpSync,
  appendFileSync,
} from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

export const IMPECCABLE_PIN = "3.5.0";
const PLUGIN_ROOT = resolve(import.meta.dirname, "..");
const VENDOR = join(PLUGIN_ROOT, "vendor", "impeccable", IMPECCABLE_PIN);

const GITIGNORE_BLOCK = `
# design tooling (installed per machine by the designli-design plugin)
.claude/skills/impeccable/
.claude/agents/impeccable-*.md
.impeccable/critique/*
!.impeccable/critique/ignore.md
.impeccable/live/server.json
.impeccable/live/sessions/
.impeccable/live/annotations/
design/**/*.html
!design/**/*.dc.html
design/**/extract-*/
design/**/.review/
`;
const PRETTIERIGNORE_BLOCK = `
# design tooling (designli-design plugin)
.claude/
design/**/*.html
`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

export function checkInstall(project) {
  const pin = JSON.parse(readFileSync(join(VENDOR, "PIN.json"), "utf8"));
  const skillDir = join(project, ".claude", "skills", "impeccable");
  const agentsDir = join(project, ".claude", "agents");
  if (!existsSync(join(skillDir, "SKILL.md"))) return { status: "MISSING", pinned: IMPECCABLE_PIN };
  const installedVersion =
    (readFileSync(join(skillDir, "SKILL.md"), "utf8").match(/^version:\s*(\S+)/m) || [])[1] ||
    "unknown";
  if (installedVersion !== IMPECCABLE_PIN)
    return { status: "VERSION_MISMATCH", installed: installedVersion, pinned: IMPECCABLE_PIN };
  const drift = [];
  for (const [rel, hash] of Object.entries(pin.files)) {
    if (rel === "LICENSE" || rel === "NOTICE.md") continue;
    const target = rel.startsWith("skills/impeccable/")
      ? join(skillDir, rel.slice("skills/impeccable/".length))
      : rel.startsWith("agents/")
        ? join(agentsDir, rel.slice("agents/".length))
        : null;
    if (!target) continue;
    if (!existsSync(target)) {
      drift.push({ file: rel, reason: "missing" });
      continue;
    }
    if (sha(target) !== hash) drift.push({ file: rel, reason: "modified" });
  }
  if (drift.length) return { status: "DRIFT", drift, pinned: IMPECCABLE_PIN };
  return { status: "OK", installed: installedVersion, pinned: IMPECCABLE_PIN };
}

function ensureBlock(file, block, marker) {
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current.includes(marker)) return false;
  appendFileSync(file, (current.endsWith("\n") || current === "" ? "" : "\n") + block);
  return true;
}

function mergeSettings(project) {
  const dir = join(project, ".claude");
  const file = join(dir, "settings.json");
  mkdirSync(dir, { recursive: true });
  let s = {};
  if (existsSync(file)) {
    try {
      s = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      throw new Error(`${file} is not valid JSON; fix it before installing`);
    }
  }
  s.env = { ...(s.env || {}), IMPECCABLE_NO_UPDATE_CHECK: "1" };
  s.enabledPlugins = { ...(s.enabledPlugins || {}), "impeccable@impeccable": false };
  s.permissions = s.permissions || {};
  const allow = new Set(s.permissions.allow || []);
  for (const rule of [
    "Bash(node .claude/skills/impeccable/scripts/*)",
    "Bash(IMPECCABLE_NO_UPDATE_CHECK=1 node .claude/skills/impeccable/scripts/*)",
    "Bash(node *scripts/preflight.mjs*)",
    "Bash(node *scripts/install-impeccable.mjs*)",
    "Bash(node *scripts/gaps.mjs*)",
    "Bash(node *scripts/adopt.mjs*)",
    "Bash(node *scripts/bundle.mjs*)",
    "Bash(node *scripts/portal.mjs*)",
    "Bash(node *scripts/setup.mjs*)",
    "Bash(pnpm dev)",
    "Bash(pnpm lint)",
    "Bash(git status *)",
    "Bash(git diff *)",
  ])
    allow.add(rule);
  s.permissions.allow = [...allow];
  writeFileSync(file, JSON.stringify(s, null, 2) + "\n");
}

export function install(project, { force = false, harness = "claude" } = {}) {
  const before = checkInstall(project);
  const written = [];
  if (harness !== "claude") {
    // other harnesses read impeccable through the designli-design MCP resources; only the ignore blocks land in the repo
    if (ensureBlock(join(project, ".gitignore"), GITIGNORE_BLOCK, "designli-design plugin"))
      written.push(".gitignore");
    if (
      ensureBlock(join(project, ".prettierignore"), PRETTIERIGNORE_BLOCK, "designli-design plugin")
    )
      written.push(".prettierignore");
    return { before: before.status, after: { status: "SKIPPED", harness }, written };
  }
  if (force || before.status !== "OK") {
    const skillDir = join(project, ".claude", "skills", "impeccable");
    const agentsDir = join(project, ".claude", "agents");
    if (existsSync(skillDir)) rmSync(skillDir, { recursive: true, force: true });
    mkdirSync(dirname(skillDir), { recursive: true });
    cpSync(join(VENDOR, "skills", "impeccable"), skillDir, { recursive: true });
    mkdirSync(agentsDir, { recursive: true });
    for (const f of readdirSync(join(VENDOR, "agents")))
      cpSync(join(VENDOR, "agents", f), join(agentsDir, f));
    const pin = JSON.parse(readFileSync(join(VENDOR, "PIN.json"), "utf8"));
    writeFileSync(
      join(skillDir, ".designli-pin.json"),
      JSON.stringify(
        {
          skillVersion: pin.skillVersion,
          upstreamCommit: pin.upstreamCommit,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    written.push(
      relative(project, skillDir) + "/",
      relative(project, agentsDir) + "/impeccable-*.md",
    );
  }
  if (ensureBlock(join(project, ".gitignore"), GITIGNORE_BLOCK, "designli-design plugin"))
    written.push(".gitignore");
  if (ensureBlock(join(project, ".prettierignore"), PRETTIERIGNORE_BLOCK, "designli-design plugin"))
    written.push(".prettierignore");
  mergeSettings(project);
  written.push(".claude/settings.json");
  return { before: before.status, after: checkInstall(project), written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (n, d) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : d;
  };
  const project = resolve(opt("--project", process.cwd()));
  const json = args.includes("--json");
  const major = Number(process.versions.node.split(".")[0]);
  const minor = Number(process.versions.node.split(".")[1]);
  if (major < 22 || (major === 22 && minor < 12)) {
    console.error(
      `Node ${process.versions.node} is too old; impeccable needs >= 22.12 (24 recommended: nvm install 24)`,
    );
    process.exit(1);
  }
  if (args.includes("--check")) {
    const r = checkInstall(project);
    console.log(
      json
        ? JSON.stringify(r)
        : `impeccable ${r.status}${r.installed ? ` installed=${r.installed}` : ""} pinned=${r.pinned}${
            r.drift
              ? ` (${r.drift.length} files: ${r.drift
                  .slice(0, 5)
                  .map((d) => d.file)
                  .join(", ")})`
              : ""
          }`,
    );
    process.exit(r.status === "OK" ? 0 : 1);
  }
  const hi = args.indexOf("--harness");
  const harness = hi >= 0 ? args[hi + 1] : "claude";
  const r = install(project, { force: args.includes("--force"), harness });
  console.log(
    json
      ? JSON.stringify(r)
      : `impeccable ${r.before} -> ${r.after.status} (${IMPECCABLE_PIN}); wrote: ${r.written.join(", ")}`,
  );
  process.exit(r.after.status === "OK" || r.after.status === "SKIPPED" ? 0 : 1);
}
