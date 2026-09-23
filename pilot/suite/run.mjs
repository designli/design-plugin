#!/usr/bin/env node
// Tier 1 of the conformance suite: drives the plugin's tools and CLIs against a portal on the
// Marquee corpus and records observations for score.mjs. Deterministic apart from timings.
//   node run.mjs --portal <url> [--project marquee] [--repo <dir>] [--keep] [--dev-admin] [--skip stress,concurrency,lost]
// Sign-in: on a portal with the developer sign-in (local stack) --dev-admin mints the admin token
// itself; otherwise the run prints a device sign-in link for a person to approve as admin.
// Tokens live in a throwaway HOME and 0600 files under the results folder; never in observations.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, chmodSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync, spawn } from "node:child_process";
import { McpClient, PLUGIN_ROOT } from "./lib/rpc.mjs";
import { Api, Token, textHash } from "./lib/api.mjs";
import { generateAll } from "./gen.mjs";
import { score } from "./score.mjs";
import { uiChecks } from "./ui.mjs";
import { runRounds } from "./rounds.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const has = (k) => argv.includes(k);
const PORTAL = (opt("--portal") || process.env.DESIGNLI_PORTAL_URL || "").replace(/\/$/, "");
if (!PORTAL) {
  console.error("usage: node run.mjs --portal <url> [--project marquee] [--repo <dir>] [--keep] [--dev-admin] [--skip a,b]");
  process.exit(2);
}
const PROJECT = opt("--project", `marquee-${new Date().toISOString().slice(2, 16).replace(/[-T:]/g, "")}`);
const SKIP = new Set((opt("--skip", "") || "").split(",").filter(Boolean));
const CORPUS = opt("--corpus", "small"); // small (ten flows) | xl (twenty flows)
const ROUNDS = has("--rounds"); // the multi-release scenario (xl); replaces the single client round
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const RESULTS = resolve(import.meta.dirname, "results", `${stamp}-tier1${(process.argv.includes("--corpus") && process.argv[process.argv.indexOf("--corpus") + 1] === "xl") ? "-xl" : ""}-${new URL(PORTAL).hostname}`);
mkdirSync(RESULTS, { recursive: true });
const HOME = join(RESULTS, ".home");
mkdirSync(join(HOME, ".config", "designli-design"), { recursive: true, mode: 0o700 });
const SECRETS = join(RESULTS, ".secrets");
// the token files and the throwaway HOME go even when the run crashes before its last line
process.on("exit", () => {
  rmSync(SECRETS, { recursive: true, force: true });
  rmSync(HOME, { recursive: true, force: true });
});
mkdirSync(SECRETS, { recursive: true, mode: 0o700 });
const REPO = resolve(opt("--repo") || join(tmpdir(), `marquee-${stamp}`));
const api = new Api(PORTAL);
const say = (s) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  console.log(line);
  appendFileSync(join(RESULTS, "run.log"), line + "\n");
};
const obs = { meta: { portal: PORTAL, project: PROJECT, repo: REPO, startedAt: new Date().toISOString(), plugin: JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version }, errors: [], timings: {} };
const fail = (step, e) => {
  const entry = { step, code: e?.code ?? e?.error?.code ?? null, message: String(e?.message ?? e?.error?.message ?? e).slice(0, 400), run: e?.run ?? e?.error?.run ?? null };
  obs.errors.push(entry);
  say(`  ! ${step}: ${entry.code ?? ""} ${entry.message}`);
  return entry;
};
const timed = async (name, fn) => {
  say(`step ${name}`);
  const t0 = Date.now();
  try {
    return await fn();
  } catch (e) {
    fail(name, e);
    return null;
  } finally {
    obs.timings[name] = (obs.timings[name] || 0) + (Date.now() - t0);
  }
};
const sh = (cmd, cwd = REPO) => execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const writeCreds = (token) =>
  writeFileSync(join(HOME, ".config", "designli-design", "credentials.json"), JSON.stringify({ portals: { [PORTAL]: { token: token.value, savedAt: new Date().toISOString() } } }), { mode: 0o600 });
const secretFile = (name, token) => {
  const p = join(SECRETS, name);
  writeFileSync(p, token.value, { mode: 0o600 });
  chmodSync(p, 0o600);
  return p;
};
const mcp = (project = REPO) => new McpClient(project, { env: { HOME, DESIGNLI_PORTAL_TOKEN: "", DESIGNLI_PORTAL_URL: PORTAL } });
const tool = async (c, name, args, step = name) => {
  const r = await c.call(name, args);
  if (!r.ok) fail(step, r.error);
  return r;
};

// ---- 0. corpus and repo ----
say(`portal ${PORTAL}, project ${PROJECT}, repo ${REPO}`);
rmSync(REPO, { recursive: true, force: true });
mkdirSync(REPO, { recursive: true });
const key = generateAll(REPO, { stress: false, profile: CORPUS === "xl" ? "xl" : undefined });
writeFileSync(join(RESULTS, "answer-key.json"), JSON.stringify(key, null, 2));
sh("git init -q -b main && git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm corpus");
const REMOTE = `${REPO}-remote.git`;
rmSync(REMOTE, { recursive: true, force: true });
sh(`git init -q --bare ${REMOTE} && git remote add origin ${REMOTE} && git push -q -u origin main`);
const health = await api.get(null, "/health");
obs.meta.portalVersion = health.json?.version ?? null;
obs.meta.portalPluginLatest = health.json?.plugin?.latest ?? null;

// ---- 1. sign-in, project, tokens, setup ----
let admin, designer, client, dev;
await timed("signin", async () => {
  if (has("--dev-admin")) {
    const r = await fetch(`${PORTAL}/api/v1/auth/dev`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@designli.co", name: "Suite Admin" }) });
    if (!r.ok) throw new Error(`dev sign-in refused (${r.status}); run without --dev-admin`);
    const session = new Token((r.headers.get("set-cookie") || "").split(";")[0], "dev session");
    admin = await api.mint(session, { label: "suite-admin", projects: null, permissions: null, expiresInDays: 30 });
    obs.signin = { mode: "dev", ok: true };
  } else {
    writeCreds(new Token("", "none"));
    const c = mcp();
    // a device code lives ten minutes on the portal; when nobody approved it in time a new one is
    // issued, up to six times, and the current link is kept in a file the person can print
    const linkFile = process.env.SUITE_SIGNIN_LINK_FILE || join(RESULTS, "SIGNIN-LINK.txt");
    let p;
    for (let cycle = 0; cycle < 6; cycle++) {
      const s = await tool(c, "signin_start", { url: PORTAL, expiresInDays: 30 });
      if (!s.ok) throw new Error("signin_start failed");
      obs.signin = { mode: "device", userCode: s.out.userCode, leaked: JSON.stringify(s.out).includes("ddev_"), cycles: cycle + 1 };
      const msg = `Approve the sign-in as ADMIN (every project, everything I can do):\n${s.out.verificationUrl}\ncode ${s.out.userCode}\n(issued ${new Date().toISOString()}, valid ten minutes; a fresh link replaces this file when it expires)\n`;
      writeFileSync(linkFile, msg);
      console.log(`\n>>> ${msg.replace(/\n/g, "\n>>> ")}`);
      for (let i = 0; i < 14; i++) {
        p = await c.call("signin_poll", { handle: s.out.handle, waitSeconds: 45 });
        if (p.out?.status !== "pending") break;
        say("  waiting for the approval…");
      }
      if (p.out?.status !== "expired") break;
      say("  the code expired; issuing a new one");
    }
    await c.close();
    rmSync(linkFile, { force: true });
    if (p.out?.status !== "approved") throw new Error(`sign-in ${p.out?.status ?? p.error?.message}`);
    obs.signin.ok = true;
    obs.signin.leaked = obs.signin.leaked || JSON.stringify(p.out).includes("dpat_");
    const cred = JSON.parse(readFileSync(join(HOME, ".config", "designli-design", "credentials.json"), "utf8"));
    admin = new Token(cred.portals[PORTAL].token, "suite-admin");
  }
});
if (!admin) {
  writeFileSync(join(RESULTS, "observations.json"), JSON.stringify(obs, null, 2));
  process.exit(1);
}
await timed("project", async () => {
  writeCreds(admin);
  const c = mcp();
  const pr = await tool(c, "portal_projects", { create: { id: PROJECT, name: "Marquee" } });
  obs.project = { created: pr.ok, error: pr.error ?? null, visible: pr.out?.projects?.some((p) => p.id === PROJECT) ?? null };
  await c.close();
  const session = await api.session(admin);
  designer = await api.mint(session, { label: "suite-designer", projects: [PROJECT], permissions: ["view", "comment", "suggest_copy", "push", "resolve", "manage_flows"], expiresInDays: 30 });
  client = await api.mint(session, { label: "suite-client", projects: [PROJECT], permissions: ["view", "comment", "suggest_copy"], expiresInDays: 30 });
  dev = await api.mint(session, { label: "suite-dev", projects: [PROJECT], permissions: ["view", "comment"], expiresInDays: 30 });
  obs.tokens = { designer: designer.label, client: client.label, dev: dev.label };
  writeCreds(designer); // from here on the plugin acts as the designer
});
await timed("setup", async () => {
  const c = mcp();
  const s = await tool(c, "setup_write", { url: PORTAL, projectId: PROJECT, harness: "claude" });
  const mcpJson = existsSync(join(REPO, ".mcp.json")) ? readFileSync(join(REPO, ".mcp.json"), "utf8") : "";
  obs.setup = { ok: s.ok, written: s.out?.written ?? null, literalToken: /dpat_[A-Za-z0-9_-]{8,}/.test(mcpJson), envExpansion: mcpJson.includes("${DESIGNLI_PORTAL_TOKEN}"), nextSteps: s.out?.nextSteps ?? null };
  const cs = await tool(c, "credentials_status", { url: PORTAL });
  obs.setup.credentials = { ok: cs.out?.ok ?? false, scopeProjects: cs.out?.scope?.projects ?? null, leaked: JSON.stringify(cs.out ?? {}).includes("dpat_") };
  await c.close();
});

// ---- 2. adopt ----
await timed("adopt", async () => {
  const c = mcp();
  const scan = await tool(c, "prototype_scan", {});
  const prop = await tool(c, "flows_propose", {});
  obs.adopt = {
    scan: { screens: scan.out?.screens?.length ?? null, components: (scan.out?.components ?? []).map((x) => ({ name: x.name, usedBy: x.usedBy.length })) },
    proposed: (prop.out?.flows ?? []).map((f) => ({ slug: f.slug, devices: f.devices, title: f.title, entry: f.entryPoints?.map((e) => e.to) ?? [], steps: f.steps.map((s) => ({ n: s.n, id: s.id, kind: s.kind, states: Object.keys(s.states) })), transitions: f.transitions, next: f.next ?? [] })),
    questions: (prop.out?.questions ?? []).map((q) => ({ flow: q.flow, field: q.field })),
    writes: [],
  };
  // answer with the key: kinds, titles, goals, entry points; states as proposed (the missing one stays missing)
  for (const f of prop.out?.flows ?? []) {
    const k = key.flows.find((x) => x.slug === f.slug);
    const flow = { ...f };
    if (k) {
      flow.title = k.title;
      flow.goal = key.flows.find((x) => x.slug === f.slug) ? FLOW_GOAL(f.slug) : f.goal;
      flow.entryPoints = [{ from: "Home", to: k.entry }];
      flow.steps = f.steps.map((s) => ({ ...s, kind: k.steps.find((ks) => ks.n === s.n)?.kind ?? s.kind }));
    }
    const w = await c.call("flows_write", { flows: [flow] });
    obs.adopt.writes.push({ slug: f.slug, ok: w.ok, error: w.error ?? null });
    if (!w.ok) fail(`flows_write ${f.slug}`, w.error);
  }
  const g = await tool(c, "gaps", {});
  obs.adopt.gaps = (g.out?.gaps ?? []).map((x) => ({ flow: x.flow, kind: x.kind, where: x.where, message: x.message }));
  await c.close();
  sh("git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm adopt && git push -q");
});
function FLOW_GOAL(slug) {
  return { "sign-up": "A fan creates an account with an email and a name." }[slug] ?? `Goal of ${slug}.`;
}

// ---- 3. publish 1 and the portal side ----
await timed("publish1", async () => {
  const c = mcp();
  const before = api.log.length;
  let p = await c.call("publish", { note: "first cut" });
  obs.publish1 = { firstAttempt: { ok: p.ok, code: p.error?.code ?? null, message: (p.error?.message ?? "").slice(0, 160), pushed: p.out?.pushed?.length ?? 0 } };
  if (!p.ok && /include Nope not found/.test(p.error?.message ?? "")) {
    // the designer's fix for the planted broken include, then publish again
    const dir = join(REPO, "design", "flows", "account-settings");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".html")))
      writeFileSync(join(dir, f), readFileSync(join(dir, f), "utf8").replace(/<dc-import name="Nope"><\/dc-import>\n?/g, ""));
    obs.publish1.brokenIncludeBlockedAll = true;
    p = await tool(c, "publish", { note: "first cut" });
  } else if (!p.ok) fail("publish1", p.error);
  else if (p.out?.skipped?.length) {
    // isolation works: the broken flow was skipped; apply the designer's fix and publish it too
    obs.publish1.skippedFirst = p.out.skipped.map((x) => x.flow);
    const dir = join(REPO, "design", "flows", "account-settings");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".html")))
      writeFileSync(join(dir, f), readFileSync(join(dir, f), "utf8").replace(/<dc-import name="Nope"><\/dc-import>\n?/g, ""));
    const again = await tool(c, "publish", { note: "first cut (account-settings fixed)" });
    if (again.ok) p = { ...again, out: { ...again.out, pushed: [...(p.out.pushed ?? []), ...(again.out.pushed ?? [])] } };
  }
  if (ROUNDS) obs.xl = { flows: key.flows.length, screens: key.flows.reduce((n, f) => n + f.files, 0), publishMs: p.ms, secondsPerFlow: Math.round((p.ms / key.flows.length) / 100) / 10 };
  Object.assign(obs.publish1, { ok: p.ok, ms: p.ms, pushed: p.out?.pushed?.map((x) => x.flow) ?? [], unchanged: p.out?.unchanged?.map((x) => x.flow) ?? [], components: p.out?.components ?? null, release: p.out?.release?.number ?? null, error: p.error ?? null });
  const d = await c.call("diagnose", { lines: 3000 });
  const lines = JSON.stringify(d.out ?? {});
  obs.publish1.http429 = (lines.match(/"status":429/g) || []).length;
  if (obs.xl) obs.xl.http429 = obs.publish1.http429;
  obs.publish1.retries = (lines.match(/"attempt":2/g) || []).length;
  await c.close();
  void before;
  sh("git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm publish1 -q || true; git push -q");
});
const rect = (d) => ({ x: d.layout?.x ?? 0, y: d.layout?.y ?? 0, w: d.w, h: d.h });
const overlaps = (m) => {
  const rs = [];
  for (const s of m.screens) for (const d of Object.values(s.devices)) if (d) rs.push(rect(d));
  let n = 0;
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) n++;
    }
  return n;
};
await timed("portal1", async () => {
  const flows = (await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? [];
  obs.portal1 = { flows: [], components: null };
  for (const f of flows) {
    const v = await api.get(designer, `/projects/${PROJECT}/flows/${f.id}/versions/latest`);
    const m = v.json?.manifest;
    if (!m) {
      obs.portal1.flows.push({ slug: f.id, error: v.error });
      continue;
    }
    obs.portal1.flows.push({ slug: f.id, version: v.json.number, devices: Object.keys(m.devices), screens: m.screens.length, mobileScreens: m.screens.filter((s) => s.devices.mobile).length, desktopScreens: m.screens.filter((s) => s.devices.desktop).length, overlaps: overlaps(m), layout: m.layout ?? null, transitions: m.transitions?.length ?? 0, entry: m.entryPoints?.map((e) => e.to) ?? [] });
  }
  const cm = await api.get(designer, `/p/${PROJECT}/components/latest/manifest.json`, { raw: true });
  if (cm.json?.screens) {
    const sheets = [];
    for (const s of cm.json.screens) {
      const h = await api.get(designer, `/p/${PROJECT}/components/latest/${s.devices.desktop.file}?raw=1`, { raw: true });
      sheets.push({ id: s.id, w: s.devices.desktop.w, h: s.devices.desktop.h, styled: /--accent/.test(h.text), fonts: /<link[^>]*stylesheet|<style/.test(h.text) });
    }
    obs.portal1.components = { version: cm.json.contentHash?.slice(0, 15), sheets };
  } else obs.portal1.components = { error: cm.error };
  // a screen with a nested include (Header imports Logo): nothing left to resolve, the logo present
  const bt = obs.portal1.flows.find((x) => x.slug === "buy-tickets" && x.version);
  if (bt) {
    const raw = await api.get(designer, `/p/${PROJECT}/buy-tickets/v${bt.version}/screens/01-Tickets-Default.html?raw=1`, { raw: true });
    obs.portal1.nested = { unresolvedImports: (raw.text.match(/<dc-import/g) || []).length, logo: /class="mq-logo">Marquee</.test(raw.text) };
  }
  // a screen fetched twice: ETag and 304
  const f0 = obs.portal1.flows.find((x) => x.version);
  if (f0) {
    const m = (await api.get(designer, `/projects/${PROJECT}/flows/${f0.slug}/versions/latest`)).json.manifest;
    const file = m.screens.find((s) => s.devices.desktop)?.devices.desktop.file;
    const r1 = await api.get(designer, `/p/${PROJECT}/${f0.slug}/v${f0.version}/${file}`, { raw: true });
    const et = r1.headers.get("etag");
    const r2 = await api.get(designer, `/p/${PROJECT}/${f0.slug}/v${f0.version}/${file}`, { raw: true, headers: { "if-none-match": et ?? "" } });
    obs.portal1.caching = { etag: !!et, notModified: r2.status === 304, bridge: r1.text.includes("data-dp-bridge") };
  }
});

/** Which structural keys of each flow.json differ from the committed one (portal/sync fields ignored). */
function flowJsonDiffs(d) {
  const out = [];
  const keys = ["title", "goal", "order", "next", "entryPoints", "steps", "transitions", "devices"];
  for (const f of readdirSync(join(d, "design", "flows"))) {
    const p = join(d, "design", "flows", f, "flow.json");
    if (!existsSync(p)) {
      out.push(`${f}: flow.json missing`);
      continue;
    }
    let before;
    try {
      before = JSON.parse(sh(`git show HEAD:design/flows/${f}/flow.json`, d));
    } catch {
      continue;
    }
    const after = JSON.parse(readFileSync(p, "utf8"));
    const stable = (v) => (Array.isArray(v) ? "[" + v.map(stable).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((x) => JSON.stringify(x) + ":" + stable(v[x])).join(",") + "}" : JSON.stringify(v ?? null));
    for (const k of keys)
      if (stable(before[k] ?? null) !== stable(after[k] ?? null)) {
        out.push(`${f}.${k}`);
        if (out.length <= 3) out.push(`  before ${JSON.stringify(before[k]).slice(0, 220)}`, `  after  ${JSON.stringify(after[k]).slice(0, 220)}`);
      }
  }
  return out;
}
// ---- 9. lost repository ----
if (!SKIP.has("lost"))
  await timed("lostRepo", async () => {
    const d = `${REPO}-lost`;
    rmSync(d, { recursive: true, force: true });
    sh(`git clone -q ${REMOTE} ${d}`, tmpdir());
    for (const f of readdirSync(join(d, "design", "flows"))) rmSync(join(d, "design", "flows", f, "flow.json"), { force: true });
    rmSync(join(d, "design", "prototype.json"), { force: true });
    const c = mcp(d);
    const a = await tool(c, "adopt_from_portal", {});
    const dry = await tool(c, "publish", { dryRun: true });
    await c.close();
    const statuses = (dry.out?.flows ?? []).map((f) => f.status);
    obs.lostRepo = { adopt: { ok: a.ok, flows: a.out?.flows?.length ?? a.out?.written?.length ?? null }, dry: statuses, unchanged: statuses.filter((s) => s === "unchanged").length, of: statuses.length, differing: flowJsonDiffs(d) };
    rmSync(d, { recursive: true, force: true });
  });

// ---- 3b. the limit checks in their own repo ----
if (!SKIP.has("stress"))
  await timed("stress", async () => {
    const dir = `${REPO}-stress`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    generateAll(dir, { stress: true });
    // keep only the two stress flows so the run stays short
    for (const f of readdirSync(join(dir, "design", "flows"))) if (!f.startsWith("stress-")) rmSync(join(dir, "design", "flows", f), { recursive: true });
    sh("git init -q -b main && git remote add origin git@example.com:acme/stress.git", dir);
    const c = mcp(dir);
    await tool(c, "setup_write", { url: PORTAL, projectId: PROJECT, harness: "none" });
    const prop = await tool(c, "flows_propose", {});
    for (const f of prop.out?.flows ?? []) await c.call("flows_write", { flows: [f] });
    obs.stress = {};
    const g = await c.call("gaps", {});
    const tooLarge = (g.out?.gaps ?? []).filter((x) => x.kind === "too-large");
    for (const slug of ["stress-files", "stress-bytes"]) {
      const t0 = Date.now();
      const r = await c.call("publish", { note: "limit check", flows: [slug] });
      const msg = [r.error?.message ?? "", ...tooLarge.filter((x) => x.flow === slug || String(x.where).includes(`/${slug}/`)).map((x) => x.proposal)].join(" ");
      obs.stress[slug] = { ok: r.ok, code: r.error?.code ?? null, message: msg.slice(0, 220), ms: Date.now() - t0, hasFix: /400 per flow|split the flow|20 MB|trim|link it by URL|not scanned/i.test(msg) };
    }
    await c.close();
    const flows = (await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? [];
    obs.stress.leakedFlows = flows.filter((f) => f.id.startsWith("stress-") && f.latestVersion > 0).map((f) => f.id);
    rmSync(dir, { recursive: true, force: true });
  });

// ---- 4x. the multi-release scenario (xl) ----
let roundsUi = null;
if (ROUNDS) {
  await timed("handoffV1", async () => {
    const c = mcp();
    obs.handoff = { flows: [] };
    for (const slug of ["buy-tickets", "sign-up", "payouts"]) {
      const h = await c.call("handoff", { flow: slug, story: `As a user I can ${slug.replace(/-/g, " ")}` });
      obs.handoff.flows.push({ slug, ok: h.ok, error: h.error ? `${h.error.code}: ${String(h.error.message).slice(0, 120)}` : null });
    }
    await c.close();
  });
  roundsUi = await runRounds({ api, PORTAL, PROJECT, REPO, REMOTE, key, obs, mcp, tool, sh, say, fail, timed, secretFile, tokens: { admin, designer, client, dev } });
}
// ---- 4. the client round ----
if (!ROUNDS) await timed("clientRound", async () => {
  const clientFile = secretFile("client.token", client);
  const staffFile = secretFile("designer.token", designer);
  const out = await new Promise((res) => {
    const p = spawn(process.execPath, [join(PLUGIN_ROOT, "pilot", "lab", "client-round.mjs"), "--url", PORTAL, "--project", PROJECT, "--client", clientFile, "--staff", staffFile, "--round", "1"], { stdio: ["ignore", "pipe", "pipe"] });
    let o = "", e = "";
    p.stdout.on("data", (d) => (o += d));
    p.stderr.on("data", (d) => (e += d));
    p.on("close", (code) => res({ code, o, e }));
  });
  let lab = null;
  try {
    lab = JSON.parse(out.o);
  } catch {
    fail("client-round.mjs", { message: out.e.slice(0, 300) || `exit ${out.code}` });
  }
  obs.clientRound = { lab: lab ? { threads: lab.threads.length, edits: lab.edits.length, waiver: lab.waiver, reorder: !!lab.reorder, agentThread: lab.threads.find((t) => t.sentToAgent)?.id ?? null } : null, nasty: {} };
  const flowOf = (slug) => `/projects/${PROJECT}/flows/${slug}`;
  const ver = async (slug) => (await api.get(client, `${flowOf(slug)}/versions/latest`)).json;
  const su = await ver("sign-up");
  if (!su?.manifest) throw new Error("sign-up is not published; the nasty cases need it");
  const comment = (slug, body) => api.post(client, `${flowOf(slug)}/comments`, body);
  const n = obs.clientRound.nasty;
  const scr = su.manifest.screens.find((s) => s.id === "01-Email-Default");
  const r1 = await comment("sign-up", { text: '<script>alert("x")</script> Looks good 🎟️ — but the button says "Continue" twice?', screen: { id: scr.id, device: "desktop" }, anchor: { x: 40, y: 40 }, flowVersion: su.number });
  n.scriptComment = { status: r1.status, storedVerbatim: r1.json?.text?.includes("<script>") ?? null, id: r1.json?.id ?? null };
  const r2 = await comment("sign-up", { text: "x".repeat(4000), flowVersion: su.number });
  const r3 = await comment("sign-up", { text: "x".repeat(4001), flowVersion: su.number });
  n.longComment = { at4000: r2.status, at4001: r3.status };
  const edit = (slug, v, screen, elementPath, originalText, newText) => api.post(client, `${flowOf(slug)}/text-edits`, { screen, elementPath, originalText, originalHash: textHash(originalText), newText, flowVersion: v });
  const e1 = await edit("sign-up", su.number, { id: scr.id, device: "desktop" }, "b/0/1/1", "Help centre", "Help center");
  const e2 = await edit("sign-up", su.number, { id: scr.id, device: "desktop" }, "b/1/1/0/0", "Email address", "Email");
  const e3 = await edit("sign-up", su.number, { id: scr.id, device: "desktop" }, "b/1/1/0/0", "Email address", "Your email");
  n.edits = { include: { status: e1.status, id: e1.json?.id }, screen: { status: e2.status, id: e2.json?.id }, supersede: { status: e3.status, replaced: e3.json?.replaced ?? null, id: e3.json?.id } };
  const tr = await ver("transfer-a-ticket");
  const mscr = tr.manifest.screens.find((s) => s.id === "02-Confirm-Default");
  const e4 = await edit("transfer-a-ticket", tr.number, { id: mscr.id, device: "mobile" }, "b/1/1/1", "Confirm and pay", "Confirm & pay");
  n.edits.mobileOnly = { status: e4.status, id: e4.json?.id };
  const wscr = su.manifest.screens.find((s) => s.id === "03-Welcome-Default");
  const e5 = await edit("sign-up", su.number, { id: wscr.id, device: "desktop" }, "b/1/2/0", "Back to events", "Back to shows");
  n.edits.toDismiss = { status: e5.status, id: e5.json?.id };
  const w = await api.post(client, `${flowOf("request-a-refund")}/waivers`, { step: "02", state: "Error", reason: "client says never" });
  n.clientWaiver = { status: w.status, code: w.code };
  const push = await api.post(client, `${flowOf("sign-up")}/versions`, { manifest: {}, files: [] }, { headers: { "if-match": "1" } });
  n.clientPush = { status: push.status, code: push.code };
  const staffWaive = await api.post(designer, `${flowOf("request-a-refund")}/waivers`, { step: "02", state: "Error", reason: "refunds are approved by hand: no server error path in the pilot" });
  n.staffWaiver = { status: staffWaive.status };
  if (r1.json?.id) {
    const flag = await api.patch(designer, `${flowOf("sign-up")}/comments/${r1.json.id}`, { sentToAgent: true });
    n.sentToAgent = { status: flag.status, id: r1.json.id };
    const clientFlag = await api.patch(client, `${flowOf("sign-up")}/comments/${r1.json.id}`, { sentToAgent: false });
    n.clientFlag = { status: clientFlag.status };
  }
});

// ---- 5. feedback ----
if (!ROUNDS) await timed("feedback", async () => {
  const c = mcp();
  const pull = await tool(c, "feedback_pull", {});
  obs.feedback = { pull: { ok: pull.ok, flows: pull.out?.flows?.map((f) => ({ flow: f.flow ?? f.slug, threads: f.threads ?? f.comments ?? null, edits: f.edits ?? f.textEdits ?? null })) ?? pull.out }, apply: {}, dismiss: null, digest: null };
  const countNew = (text) => sh(`grep -rl --exclude-dir=bundle --include='*.html' -- ${JSON.stringify(text)} design | wc -l`).trim();
  // decline one edit with a reason before applying, so it must not land
  const toDismiss = obs.clientRound?.nasty?.edits?.toDismiss?.id;
  if (toDismiss) {
    const d = await c.call("edits_dismiss", { flow: "sign-up", id: toDismiss, reason: "the label matches the button on the events page; keeping it" });
    obs.feedback.dismiss = { ok: d.ok, error: d.error ?? null };
  }
  for (const slug of ["sign-up", "transfer-a-ticket"]) {
    const a = await c.call("edits_apply", { flow: slug });
    obs.feedback.apply[slug] = { ok: a.ok, applied: a.out?.applied ?? null, needsManual: a.out?.needsManual?.length ?? null, sourceFiles: (a.out?.results ?? []).reduce((n, r) => n + (r.files ?? []).filter((f) => f.result === "applied" && !f.include).length, 0), includeHits: (a.out?.results ?? []).flatMap((r) => (r.files ?? []).filter((f) => f.include).map((f) => ({ include: f.include, screensUsing: f.screensUsing ?? null, result: f.result }))), files: (a.out?.results ?? []).map((r) => ({ id: r.id, result: r.result, files: (r.files ?? []).filter((f) => f.result === "applied").length })), error: a.error ?? null };
  }
  obs.feedback.filesWith = { "Help center": Number(countNew("Help center")), Email: Number(sh(`grep -rl --exclude-dir=bundle --include='*.html' -- '>Email<' design | wc -l`)), "Your email": Number(countNew("Your email")), "Confirm &amp; pay": Number(countNew("Confirm &amp; pay")), "Back to shows": Number(countNew("Back to shows")) };
  obs.feedback.includeEditedOnce = readFileSync(join(REPO, "design", "components", "Header.html"), "utf8").includes("Help center") && Number(countNew("Help center")) === 1;
  // the lab script's own flow (whichever was first in the journey when it ran): apply there too
  for (const f of (await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? [])
    if (f.pendingEdits > 0 && !obs.feedback.apply[f.id]) {
      const a = await c.call("edits_apply", { flow: f.id });
      obs.feedback.apply[f.id] = { ok: a.ok, applied: a.out?.applied ?? null, needsManual: a.out?.needsManual?.length ?? null, sourceFiles: (a.out?.results ?? []).reduce((n, r) => n + (r.files ?? []).filter((x) => x.result === "applied" && !x.include).length, 0) };
    }
  const dg = await tool(c, "feedback_digest", {});
  const items = dg.out?.items ?? dg.out?.threads ?? dg.out?.digest ?? [];
  obs.feedback.digest = { ok: dg.ok, count: Array.isArray(items) ? items.length : null, firstIsAgent: Array.isArray(items) && items.length ? !!(items[0].sentToAgent || items[0].agent || /agent/i.test(JSON.stringify(items[0]).slice(0, 200))) : null, raw: JSON.stringify(dg.out).slice(0, 800) };
  const agentId = obs.clientRound?.nasty?.sentToAgent?.id;
  if (agentId) {
    const rp = await c.call("portal_reply", { flow: "sign-up", thread: agentId, text: "Made the button label 'Continue' once; the second one was the footer link." });
    const rs = await c.call("portal_resolve", { flow: "sign-up", thread: agentId });
    obs.feedback.replies = { reply: rp.ok, resolve: rs.ok, error: rp.error ?? rs.error ?? null };
  }
  await c.close();
  sh("git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm feedback && git push -q");
});

// ---- 6. publish 2, release diff, the stale path, one force ----
if (!ROUNDS) await timed("publish2", async () => {
  const touch = (p, from, to) => writeFileSync(join(REPO, p), readFileSync(join(REPO, p), "utf8").replace(from, to));
  touch("design/flows/sign-up/01-email-default.html", "Continue", "Continue to details");
  touch("design/flows/sign-up/01-email-default-m.html", "Continue", "Continue to details");
  touch("design/flows/payouts/01-overview-default.html", "Continue", "See history");
  touch("design/components/Footer.html", "Prices in COP", "All prices in COP");
  const c = mcp();
  let p = await c.call("publish", { note: "round 2: client feedback" });
  obs.publish2 = { staleAfterOwnReply: !p.ok && p.error?.code === "STALE_LOCAL" };
  if (!p.ok && p.error?.code === "STALE_LOCAL") {
    await tool(c, "feedback_pull", {});
    p = await tool(c, "publish", { note: "round 2: client feedback" });
  } else if (!p.ok) fail("publish2", p.error);
  Object.assign(obs.publish2, { ok: p.ok, pushed: p.out?.pushed?.map((x) => x.flow) ?? [], unchanged: p.out?.unchanged?.length ?? null, skipped: p.out?.skipped ?? null, components: p.out?.components?.state ?? null, release: p.out?.release?.number ?? null });
  const rel = await api.get(designer, `/projects/${PROJECT}/releases`);
  const latest = (rel.json?.releases ?? [])[0];
  const detail = latest ? await api.get(designer, `/projects/${PROJECT}/releases/${latest.number}`) : null;
  const changes = detail?.json?.changes ?? [];
  const rows = changes.flatMap((c) => (c.screens ?? []).map((r) => ({ ...r, flow: c.id })));
  obs.publish2.diff = { rows: rows.length, viaInclude: rows.filter((r) => r.via === "include").length, viaSource: rows.filter((r) => r.via === "source").length, flowsChanged: changes.filter((c) => c.status === "changed").map((c) => c.id), flowsUnchanged: changes.filter((c) => c.status === "unchanged").length, sample: rows.filter((r) => r.via === "source").slice(0, 20) };
  // stale: a new comment, then a publish without pulling
  const su = (await api.get(client, `/projects/${PROJECT}/flows/sign-up/versions/latest`)).json;
  touch("design/flows/sign-up/03-welcome-default.html", "You are all set.", "You are all set!");
  await api.post(client, `/projects/${PROJECT}/flows/sign-up/comments`, { text: "One more: the welcome copy feels flat.", flowVersion: su.number });
  const stale = await c.call("publish", { note: "round 3" });
  obs.publish2.stale = { refused: !stale.ok, code: stale.error?.code ?? null, mentionsPull: /pull/i.test(stale.error?.message ?? ""), forceOffered: /force/i.test(stale.error?.message ?? "") };
  const forced = await c.call("publish", { note: "round 3 (forced on purpose)", force: true });
  obs.publish2.force = { ok: forced.ok, release: forced.out?.release?.number ?? null };
  const rl = await c.call("releases", {});
  obs.publish2.releasesTool = { ok: rl.ok, count: rl.out?.releases?.length ?? null };
  await c.close();
  sh("git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm round2 && git push -q");
});

// ---- 8. handoffs ----
if (!ROUNDS) await timed("handoff", async () => {
  const c = mcp();
  obs.handoff = { flows: [] };
  for (const k of key.flows) {
    const h = await c.call("handoff", { flow: k.slug, story: `As a user I can ${k.title.toLowerCase()}` });
    const entry = { slug: k.slug, ok: h.ok, error: h.error ? `${h.error.code}: ${String(h.error.message).slice(0, 120)}` : null };
    if (h.ok) {
      const list = (await api.get(dev, `/projects/${PROJECT}/flows/${k.slug}/handoffs`)).json?.handoffs ?? [];
      const id = list[0]?.id ?? h.out?.id;
      const full = id ? (await api.get(dev, `/projects/${PROJECT}/flows/${k.slug}/handoffs/${id}`)).json : null;
      const spec = full?.spec ?? "";
      entry.spec = { chars: spec.length, steps: k.steps.filter((s) => spec.includes(`## ${s.n} `)).length, of: k.steps.length, gridStates: full?.grid ? Object.keys(full.grid.states ?? full.grid).length : null, copyHits: ["Continue", "Pay COP 180.000", "Confirm and pay", "Back to events"].filter((t) => spec.includes(t)).length, transitions: k.transitions.filter((t) => spec.includes(t.to)).length, of_t: k.transitions.length, waived: /waiv|n\/a:/i.test(spec), screens: full?.screens?.length ?? null, devGet: !!full };
    }
    obs.handoff.flows.push(entry);
  }
  await c.close();
});

// ---- 7. concurrency: two clones publish at once ----
if (!SKIP.has("concurrency") && !ROUNDS)
  await timed("concurrency", async () => {
    const a = `${REPO}-clone-a`, b = `${REPO}-clone-b`;
    for (const d of [a, b]) {
      rmSync(d, { recursive: true, force: true });
      sh(`git clone -q ${REMOTE} ${d}`, tmpdir());
    }
    writeFileSync(join(a, "design/flows/notifications/01-details-default.html"), readFileSync(join(a, "design/flows/notifications/01-details-default.html"), "utf8").replace("Continue", "Next: channels"));
    writeFileSync(join(b, "design/flows/notifications/01-details-default.html"), readFileSync(join(b, "design/flows/notifications/01-details-default.html"), "utf8").replace("Continue", "Go on"));
    const ca = mcp(a), cb = mcp(b);
    const before = (await api.get(designer, `/projects/${PROJECT}/flows/notifications/versions`)).json?.versions?.length ?? 0;
    const [ra, rb] = await Promise.all([ca.call("publish", { note: "race A", flows: ["notifications"] }), cb.call("publish", { note: "race B", flows: ["notifications"] })]);
    await ca.close();
    await cb.close();
    const after = (await api.get(designer, `/projects/${PROJECT}/flows/notifications/versions`)).json?.versions?.length ?? 0;
    obs.concurrency = { a: { ok: ra.ok, code: ra.error?.code ?? null }, b: { ok: rb.ok, code: rb.error?.code ?? null }, newVersions: after - before, clean: (ra.ok ? 1 : 0) + (rb.ok ? 1 : 0) === after - before };
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  });

// ---- 10. reliability ----
await timed("reliability", async () => {
  const c = mcp();
  const st = await tool(c, "project_status", {});
  obs.reliability = { status: { ok: st.out?.ok ?? null, pluginNotice: st.out?.plugin?.message ?? null, latest: st.out?.plugin?.latest ?? null, blockers: st.out?.blockers?.map((b) => b.code) ?? [], nextSteps: st.out?.nextSteps?.length ?? null } };
  const bad = await c.call("handoff", { flow: "no-such-flow", story: "forced failure" });
  const run = bad.error?.run ?? null;
  const dg = run ? await c.call("diagnose", { run }) : null;
  obs.reliability.diagnose = { failedWithRun: !!run, code: bad.error?.code ?? null, linesForRun: dg?.out?.lines?.length ?? null };
  const exp = await c.call("signin_poll", { handle: "signin_999" });
  obs.reliability.expiredHandle = { code: exp.error?.code ?? null };
  const stats = api.stats();
  obs.reliability.api = stats;
  obs.reliability.errorsWithRunId = obs.errors.filter((e) => e.run).length;
  obs.reliability.errorsTotal = obs.errors.length;
  await c.close();
});

// ---- 11. the pages, in a browser ----
if (!SKIP.has("ui"))
  await timed("ui", async () => {
    // a real client account (invite → password), since a scoped token must not open a session
    let clientSession = null;
    const email = `suite-client-${stamp.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`;
    const created = await api.post(admin, "/admin/clients", { email, name: "Suite Client", projectIds: [PROJECT] });
    const inviteToken = created.json?.invite?.url?.split("/invite/")[1] ?? null;
    if (inviteToken) {
      const password = "suite-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const acc = await api.post(null, `/invites/${inviteToken}/accept`, { password, name: "Suite Client" });
      const login = await fetch(`${PORTAL}/api/v1/auth/password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
      if (login.ok && cookie) clientSession = new Token(cookie, "client (session)");
      obs.clientAccount = { created: created.status, accepted: acc.status, signedIn: login.ok };
    } else obs.clientAccount = { created: created.status, error: created.error };
    obs.ui = await uiChecks({ api, portal: PORTAL, project: PROJECT, staffSession: await api.session(admin), clientSession, results: RESULTS, flows: ["buy-tickets", "transfer-a-ticket", "create-an-event", "account-settings"], ...(roundsUi ?? {}) });
    if (obs.ui.skipped) say(`  ui skipped: ${obs.ui.skipped}`);
  });

obs.meta.finishedAt = new Date().toISOString();
writeFileSync(join(RESULTS, "observations.json"), JSON.stringify(obs, null, 2));
const card = score(key, obs, { tier: "tier1", results: RESULTS });
writeFileSync(join(RESULTS, "scorecard.json"), JSON.stringify(card, null, 2));
writeFileSync(join(RESULTS, "scorecard.md"), card.markdown);
rmSync(SECRETS, { recursive: true, force: true });
rmSync(HOME, { recursive: true, force: true });
if (!has("--keep")) {
  rmSync(REPO, { recursive: true, force: true });
  rmSync(REMOTE, { recursive: true, force: true });
}
console.log("\n" + card.markdown);
console.log(`results: ${RESULTS}`);
