#!/usr/bin/env node
// Client for the Designli design portal. JSON on stdout; never echoes secrets.
//   node portal.mjs login-check [--url U]
//   node portal.mjs login --url U               token from DESIGNLI_PORTAL_TOKEN or stdin (echo off); stored 0600 in ~/.config/designli-design
//   node portal.mjs projects [--create ID --name N]
//   node portal.mjs status                      the portal side: flows, versions, open feedback, last release
//   node portal.mjs publish [--note "..."] [--flows a,b] [--dry-run] [--force]
//   node portal.mjs pull [--flows a,b] [--status open|resolved|all]
//   node portal.mjs digest [--since last-publish|last-pull|<iso>] [--flows a,b]
//   node portal.mjs edits apply --flow SLUG
//   node portal.mjs reply --flow SLUG --thread ID --text "..."     node portal.mjs resolve|reopen --flow SLUG --thread ID
//   node portal.mjs handoff --flow SLUG --story "..." [--components A,B]
//   node portal.mjs adopt                       rebuild flow.json files from the portal
//   node portal.mjs releases                    list releases (refreshes design/releases.json)
//   node portal.mjs head --flow SLUG            low level: head version and feedback counts
//   node portal.mjs push --flow SLUG [--force] [--note "..."]   low level: one flow, no release
// Every command needs a project: run from the repository root or pass --project <dir>.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeUrl,
  urlAllowed,
  looksLikeToken,
  tokenFor,
  storeToken,
  whoami,
  readLibrary,
  DEFAULT_PORTAL,
} from "../server/lib/setup.mjs";
import * as P from "../server/lib/portal.mjs";

const args = process.argv.slice(2);
const cmd = args[0];
const sub = args[1] && !args[1].startsWith("--") ? args[1] : null;
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const has = (n) => args.includes(n);
const list = (n) =>
  opt(n)
    ? opt(n)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
const project = resolve(opt("--project", process.env.DESIGNLI_PROJECT_DIR || process.cwd()));
// write, then exit once stdout drained (a bare process.exit truncates large piped output)
const out = (o) => {
  process.stdout.write(JSON.stringify(o, null, 2) + "\n", () =>
    process.exit(o.ok === false ? 1 : 0),
  );
  return new Promise(() => {});
};
const fail = (message, extra = {}) => out({ ok: false, error: message, ...extra });
if (!cmd || has("--help")) {
  console.log(
    readFileSync(new URL(import.meta.url), "utf8")
      .split("\n")
      .slice(1, 18)
      .join("\n"),
  );
  process.exit(0);
}
async function readSecretFromStdin() {
  if (process.stdin.isTTY) {
    const rl = (await import("node:readline")).createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    return new Promise((res) => {
      process.stderr.write("Paste the token (input hidden): ");
      const orig = rl._writeToOutput;
      rl._writeToOutput = () => {};
      rl.question("", (a) => {
        rl._writeToOutput = orig;
        process.stderr.write("\n");
        rl.close();
        res(a.trim());
      });
    });
  }
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").trim().split(/\s+/)[0] || null;
}

(async () => {
  if (has("--token"))
    return fail(
      "--token is not accepted: put the token in DESIGNLI_PORTAL_TOKEN or run `portal.mjs login` (it reads stdin)",
    );
  try {
    const url = normalizeUrl(
      opt("--url") ||
        process.env.DESIGNLI_PORTAL_URL ||
        readLibrary(project)?.publish?.portal?.url ||
        DEFAULT_PORTAL,
    );
    if (cmd === "login") {
      const t = process.env.DESIGNLI_PORTAL_TOKEN || (await readSecretFromStdin());
      if (!t)
        return fail(
          "login needs the token in DESIGNLI_PORTAL_TOKEN or on stdin (e.g. `pbpaste | node portal.mjs login --url U`)",
        );
      if (!looksLikeToken(t)) return fail("that does not look like a dpat_ token");
      if (!urlAllowed(url))
        return fail("refusing to send a token over plain http; use https (localhost is allowed)");
      const w = await whoami(url, t);
      if (!w.ok) return out({ ok: false, url, status: w.status, error: w.error });
      storeToken(url, t);
      return out({ ok: true, url, tokenSource: "credentials", user: w.user, scope: w.scope });
    }
    if (cmd === "login-check") {
      const { token, source } = tokenFor(url);
      if (!token)
        return out({
          ok: false,
          url,
          tokenSource: null,
          error:
            "no token: set DESIGNLI_PORTAL_TOKEN or run `portal.mjs login --url <url>` (token on stdin)",
        });
      const w = await whoami(url, token);
      if (!w.ok)
        return out({ ok: false, url, tokenSource: source, status: w.status, error: w.error });
      return out({
        ok: true,
        url,
        tokenSource: source,
        user: w.user,
        memberships: w.memberships,
        scope: w.scope,
      });
    }
    if (cmd === "projects") {
      const { token } = tokenFor(url);
      if (!token) return fail("no token: run portal.mjs login");
      const c = { url, token, project, projectId: null };
      if (opt("--create")) {
        const r = await P.call(c, "POST", "/projects", {
          id: opt("--create"),
          name: opt("--name") || opt("--create"),
        });
        if (r.status !== 201)
          return fail(r.json?.error?.message || "create failed", { status: r.status });
        return out({ ok: true, created: r.json });
      }
      const w = await whoami(url, token);
      if (!w.ok) return fail(w.error, { status: w.status });
      return out({ ok: true, projects: w.projects });
    }
    const ctx = P.context(project, { url: opt("--url"), projectId: opt("--project-id") });
    if (cmd === "status") return out({ ok: true, ...(await P.overview(ctx)) });
    if (cmd === "publish")
      return out({
        ok: true,
        ...(await P.publish(ctx, {
          note: opt("--note"),
          flows: list("--flows"),
          dryRun: has("--dry-run"),
          force: has("--force"),
        })),
      });
    if (cmd === "pull")
      return out({
        ok: true,
        flows: await P.pullAll(ctx, { flows: list("--flows"), status: opt("--status", "all") }),
      });
    if (cmd === "digest")
      return out({
        ok: true,
        ...P.digest(project, { since: opt("--since"), flows: list("--flows") }),
      });
    if (cmd === "edits" && sub === "apply")
      return out({ ok: true, ...P.editsApply(project, opt("--flow")) });
    if (cmd === "reply")
      return out({
        ok: true,
        ...(await P.reply(ctx, opt("--flow"), opt("--thread"), opt("--text"))),
      });
    if (cmd === "resolve" || cmd === "reopen")
      return out({
        ok: true,
        ...(await P.resolveThread(ctx, opt("--flow"), opt("--thread"), cmd === "reopen")),
      });
    if (cmd === "handoff")
      return out({
        ok: true,
        ...(await P.handoff(ctx, opt("--flow"), {
          story: opt("--story"),
          components: list("--components"),
        })),
      });
    if (cmd === "adopt") return out({ ok: true, ...(await P.adoptFromPortal(ctx)) });
    if (cmd === "releases") return out({ ok: true, releases: await P.listReleases(ctx) });
    if (cmd === "head") {
      const slug = opt("--flow");
      if (!slug) return fail("head needs --flow <slug>");
      return out({ ok: true, flow: slug, ...(await P.head(ctx, slug.split("/").pop())) });
    }
    if (cmd === "push")
      return out({
        ok: true,
        ...(await P.pushFlow(ctx, opt("--flow"), { force: has("--force"), note: opt("--note") })),
      });
    return fail(`unknown command ${cmd}`);
  } catch (e) {
    return fail(e.message, {
      code: e.code ?? null,
      details: e.details ?? null,
      ...(e.code === "STALE_LOCAL" ? { stale: true } : {}),
    });
  }
})();
