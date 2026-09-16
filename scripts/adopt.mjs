#!/usr/bin/env node
// Adopting a prototype from the command line (the agent uses the MCP tools of the same names).
//   node adopt.mjs scan [--dir design] [--project <dir>]           what the files say
//   node adopt.mjs propose [--dir design] [--project <dir>]        flows, steps, states, questions (never writes)
//   node adopt.mjs write --file proposal.json [--project <dir>]    { flows, prototype } → flow.json files, prototype.json
//   node adopt.mjs from-portal [--project <dir>]                   rebuild the declarations from the portal
// JSON on stdout.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanPrototype, proposeFlows, writeFlows } from "../server/lib/flows.mjs";
import { context, adoptFromPortal } from "../server/lib/portal.mjs";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const project = resolve(opt("--project", process.env.DESIGNLI_PROJECT_DIR || process.cwd()));
const out = (o) => {
  console.log(JSON.stringify(o, null, 2));
  process.exit(o.ok === false ? 1 : 0);
};
try {
  if (cmd === "scan") out(scanPrototype(project, { dir: opt("--dir") }));
  else if (cmd === "propose")
    out(proposeFlows(project, scanPrototype(project, { dir: opt("--dir") })));
  else if (cmd === "write") {
    const file = opt("--file");
    if (!file) out({ ok: false, error: "write needs --file <json> with { flows, prototype }" });
    out(writeFlows(project, JSON.parse(readFileSync(resolve(file), "utf8"))));
  } else if (cmd === "from-portal") out(await adoptFromPortal(context(project)));
  else
    out({
      ok: false,
      error: "usage: adopt.mjs scan | propose | write --file <json> | from-portal",
    });
} catch (e) {
  out({ ok: false, error: e.message, code: e.code ?? null, details: e.details ?? null });
}
