#!/usr/bin/env node
// Doctor for every designli-design verb.
//   node preflight.mjs [--project <dir>] [--require git,setup,prototype,flows] [--hashes] [--json]
import { resolve } from "node:path";
import { preflight } from "../server/lib/status.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const project = resolve(opt("--project", process.env.DESIGNLI_PROJECT_DIR || process.cwd()));
const out = preflight(project, {
  require: (opt("--require", "") || "").split(",").filter(Boolean),
  hashes: args.includes("--hashes"),
});
if (args.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(out.ok ? "preflight OK" : "preflight BLOCKED");
  for (const b of out.blockers) console.log(`  BLOCKER ${b.code}: ${b.message}\n    fix: ${b.fix}`);
  for (const w of out.warnings) console.log(`  warning ${w.code}: ${w.message}\n    fix: ${w.fix}`);
  const i = out.info;
  console.log(
    `  node ${i.node}; git ${i.git.repo ? (i.git.remote ? "with remote" : "no remote") : "none"}; portal ${i.publish?.portal ? `${i.publish.portal.url} / ${i.publish.portal.projectId}` : "not connected"}; token ${i.tokenSource ?? "none"}`,
  );
  console.log(
    `  prototype ${i.prototype?.exists ? "adopted" : "not adopted"}; flows: ${i.flows.map((f) => `${f.slug} (${f.screens} screens, ${f.missingStates.length} missing, v${f.publishedVersion ?? 0})`).join(", ") || "none"}; gaps ${i.gaps.total}`,
  );
}
process.exit(out.ok ? 0 : 1);
