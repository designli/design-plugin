#!/usr/bin/env node
// Generates vendor/impeccable/<version>/PIN.json: sha256 per vendored file.
// Usage: node scripts/gen-pin.mjs [--version 3.5.0] [--upstream-commit <sha>]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const version = opt("--version", "3.5.0");
const upstreamCommit = opt("--upstream-commit", null);
const root = resolve(import.meta.dirname, "..", "vendor", "impeccable", version);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name !== "PIN.json") out.push(p);
  }
  return out;
}

const files = {};
for (const p of walk(root).sort()) {
  files[relative(root, p)] = createHash("sha256").update(readFileSync(p)).digest("hex");
}
const skill = readFileSync(join(root, "skills", "impeccable", "SKILL.md"), "utf8");
const m = skill.match(/^version:\s*(\S+)/m);
if (!m || m[1] !== version) {
  console.error(`SKILL.md version (${m?.[1]}) does not match --version ${version}`);
  process.exit(1);
}
const pin = {
  skillVersion: version,
  upstream: "https://github.com/pbakaus/impeccable",
  upstreamCommit,
  license: "Apache-2.0",
  generatedAt: new Date().toISOString(),
  fileCount: Object.keys(files).length,
  files,
};
writeFileSync(join(root, "PIN.json"), JSON.stringify(pin, null, 2) + "\n");
console.log(`PIN.json written: ${pin.fileCount} files, impeccable ${version}`);
