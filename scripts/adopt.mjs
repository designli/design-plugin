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
import { setRun, log } from "../server/lib/log.mjs";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const project = resolve(opt("--project", process.env.DESIGNLI_PROJECT_DIR || process.cwd()));
// write, then exit once stdout drained (a bare process.exit truncates large piped output)
const RUN = setRun();
const out = (o) => {
  if (o.ok === false) log("cli.error", { cmd, code: o.code ?? null, error: o.error });
  process.stdout.write(JSON.stringify(o, null, 2) + "\n", () =>
    process.exit(o.ok === false ? 1 : 0),
  );
  return new Promise(() => {});
};
(async () => {
  try {
    if (cmd === "scan") return out(scanPrototype(project, { dir: opt("--dir") }));
    else if (cmd === "propose")
      return out(proposeFlows(project, scanPrototype(project, { dir: opt("--dir") })));
    else if (cmd === "write") {
      const file = opt("--file");
      if (!file)
        return out({ ok: false, error: "write needs --file <json> with { flows, prototype }" });
      return out(writeFlows(project, JSON.parse(readFileSync(resolve(file), "utf8"))));
    } else if (cmd === "from-portal") out(await adoptFromPortal(context(project)));
    else
      return out({
        ok: false,
        error: "usage: adopt.mjs scan | propose | write --file <json> | from-portal",
      });
  } catch (e) {
    return out({ ok: false, error: e.message, code: e.code ?? null, details: e.details ?? null });
  }
})();
