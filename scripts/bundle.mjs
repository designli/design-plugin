#!/usr/bin/env node
// Builds the portable bundle for a flow or for the components: manifest.json + screens/*.html.
//   node bundle.mjs --flow <slug|dir> [--project <dir>] [--out <dir>] [--json]
//   node bundle.mjs --components [--project <dir>] [--out <dir>] [--json]
import { resolve } from "node:path";
import { buildFlowBundle, buildComponentsBundle } from "../server/lib/bundle.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const project = resolve(opt("--project", process.env.DESIGNLI_PROJECT_DIR || process.cwd()));
const json = args.includes("--json");
let b;
try {
  b =
    args.includes("--components") || !opt("--flow")
      ? buildComponentsBundle(project, { out: opt("--out") })
      : buildFlowBundle(project, opt("--flow"), { out: opt("--out") });
} catch (e) {
  if (json) console.log(JSON.stringify({ ok: false, error: e.message, code: e.code ?? null }));
  else console.error(`bundle: ${e.message}`);
  process.exit(2);
}
const { files, manifest, ...res } = b;
if (json)
  console.log(
    JSON.stringify({
      ...res,
      manifest: manifest
        ? {
            contentHash: manifest.contentHash,
            screens: manifest.screens.length,
            transitions: manifest.transitions.length,
          }
        : null,
    }),
  );
else {
  console.log(
    `bundle: ${res.empty ? "nothing to bundle" : `${res.screens} screens -> ${res.out}  ${res.contentHash}`}`,
  );
  for (const w of res.warnings || []) console.log(`  warning: ${w}`);
  for (const e of res.errors || []) console.log(`  ERROR: ${e}`);
}
process.exit(res.ok ? 0 : 1);
