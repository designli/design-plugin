#!/usr/bin/env node
// What stands between the prototype and a clean publish or handoff.
//   node gaps.mjs [--project <dir>] [--flow <slug>] [--strict] [--json]
// Exit 0 when nothing blocks (in --strict, when the strict subset is empty).
import { resolve } from "node:path";
import { gapsOf } from "../server/lib/flows.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const project = resolve(opt("--project", process.env.DESIGNLI_PROJECT_DIR || process.cwd()));
const strict = args.includes("--strict");
let r;
try {
  r = gapsOf(project, { flow: opt("--flow"), strict });
} catch (e) {
  console.error(`gaps: ${e.message}`);
  process.exit(2);
}
if (args.includes("--json")) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
else {
  console.log(r.gaps.length ? `${r.gaps.length} gap(s)${strict ? " (strict)" : ""}:` : "no gaps");
  for (const g of r.gaps)
    console.log(`  ${g.flow ? g.flow + " " : ""}${g.kind} @ ${g.where}: ${g.proposal}`);
}
process.exitCode = (strict ? r.gaps.length : r.blocking.length) ? 1 : 0;
