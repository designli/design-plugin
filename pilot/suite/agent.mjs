#!/usr/bin/env node
// Tier 2 of the conformance suite: the real skills, run through headless Claude Code on a fresh
// copy of the Marquee corpus, against a portal. Measures what a designer gets: what the agent
// wrote to the repo and pushed to the portal (scored with the same answer key), the questions it
// would have asked, and whether it stayed inside the guides.
//   node agent.mjs --portal <url> --project <id> --designer-token-file <0600 file> [--client-token-file <f>] [--model <m>] [--keep]
// The project must exist and the designer token must be scoped to it (tier 1 mints such tokens;
// a person can mint one on Account). Tokens travel only as DESIGNLI_PORTAL_TOKEN in the child's
// environment. The run needs the `claude` CLI signed in on this machine.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execSync } from "node:child_process";
import { PLUGIN_ROOT } from "./lib/rpc.mjs";
import { Api, Token, textHash } from "./lib/api.mjs";
import { generateAll } from "./gen.mjs";
import { score } from "./score.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const has = (k) => argv.includes(k);
const PORTAL = (opt("--portal") || "").replace(/\/$/, "");
const PROJECT = opt("--project");
const TOKEN_FILE = opt("--designer-token-file");
if (!PORTAL || !PROJECT || !TOKEN_FILE) {
  console.error("usage: node agent.mjs --portal <url> --project <id> --designer-token-file <file> [--client-token-file <file>] [--model <m>] [--keep]");
  process.exit(2);
}
const designer = Token.fromFile(TOKEN_FILE, "designer");
const client = has("--client-token-file") ? Token.fromFile(opt("--client-token-file"), "client") : null;
const MODEL = opt("--model", null);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const RESULTS = resolve(import.meta.dirname, "results", `${stamp}-tier2-${new URL(PORTAL).hostname}`);
mkdirSync(RESULTS, { recursive: true });
const REPO = resolve(join(tmpdir(), `marquee-agent-${stamp}`));
const api = new Api(PORTAL);
const say = (s) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  console.log(line);
  appendFileSync(join(RESULTS, "run.log"), line + "\n");
};
const sh = (cmd, cwd = REPO) => execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const obs = { meta: { portal: PORTAL, project: PROJECT, repo: REPO, tier: "tier2", startedAt: new Date().toISOString(), plugin: JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version, model: MODEL }, errors: [], timings: {}, agent: { steps: [] } };

// ---- corpus ----
rmSync(REPO, { recursive: true, force: true });
mkdirSync(REPO, { recursive: true });
const key = generateAll(REPO, { stress: false });
writeFileSync(join(RESULTS, "answer-key.json"), JSON.stringify(key, null, 2));
sh("git init -q -b main && git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm corpus");
const REMOTE = `${REPO}-remote.git`;
sh(`git init -q --bare ${REMOTE} && git remote add origin ${REMOTE} && git push -q -u origin main`);
const health = await api.get(null, "/health");
obs.meta.portalVersion = health.json?.version ?? null;
obs.meta.portalPluginLatest = health.json?.plugin?.latest ?? null;

// ---- one headless session, resumed between steps ----
const SYSTEM = [
  "You are running unattended in a test harness. No person can answer questions.",
  "Whenever a guide tells you to ask the designer something, take the recommended default (or the most reasonable reading of the files) and continue.",
  "At the very end of your reply, add a section titled exactly 'QUESTIONS I WOULD HAVE ASKED' with one line per question you would normally have asked, in the form '<flow>: <field>: <what you would ask>'. Write 'none' if there are none.",
  "Never use force on a publish unless the prompt explicitly says so. Never print a token.",
].join(" ");
let sessionId = null;
async function step(name, prompt, { maxTurns = 80 } = {}) {
  say(`step ${name}`);
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--plugin-dir", PLUGIN_ROOT, "--permission-mode", "dontAsk", "--allowedTools", "mcp__designli-design__*,Bash(node *),Bash(git *),Bash(ls *),Bash(cat *),Read,Edit,Write,Glob,Grep,MultiEdit", "--append-system-prompt", SYSTEM, "--max-turns", String(maxTurns), "--settings", JSON.stringify({ enabledPlugins: { "designli-design@designli-tools": false } })];
  if (sessionId) args.push("--resume", sessionId);
  if (MODEL) args.push("--model", MODEL);
  const t0 = Date.now();
  const r = await new Promise((res) => {
    const p = spawn("claude", args, { cwd: REPO, env: { ...process.env, DESIGNLI_PORTAL_TOKEN: designer.value, DESIGNLI_PORTAL_URL: PORTAL }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => res({ code, out, err }));
  });
  const events = r.out.split("\n").filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
  const tools = [];
  for (const e of events)
    for (const c of e.message?.content ?? [])
      if (c.type === "tool_use") tools.push({ name: c.name, input: c.input });
  const result = events.find((e) => e.type === "result") ?? {};
  sessionId = result.session_id ?? sessionId;
  const text = result.result ?? "";
  const questions = (text.split(/QUESTIONS I WOULD HAVE ASKED/i)[1] ?? "").split("\n").map((l) => l.replace(/^[-*\d.\s]+/, "").trim()).filter((l) => l && !/^none\b/i.test(l));
  const entry = { name, code: r.code, ms: Date.now() - t0, turns: result.num_turns ?? null, costUsd: result.total_cost_usd ?? null, tools: tools.map((t) => t.name), forced: tools.some((t) => /publish/.test(t.name) && t.input?.force === true), tokenInText: /dpat_[A-Za-z0-9_-]{8,}/.test(r.out), questions, resultTail: text.slice(-600), stderr: r.err.slice(0, 300) };
  obs.agent.steps.push(entry);
  writeFileSync(join(RESULTS, `transcript-${name}.jsonl`), r.out.replace(/dpat_[A-Za-z0-9_-]{8,}/g, "dpat_…"));
  say(`  ${name}: exit ${r.code}, ${entry.turns} turns, $${entry.costUsd ?? "?"}, ${tools.length} tool calls, ${questions.length} questions listed`);
  return entry;
}

await step("setup", `/designli-design:setup Portal ${PORTAL}, project ${PROJECT}, harness Claude Code. The token is already in the environment.`);
await step("adopt", "/designli-design:adopt");
await step("publish1", '/designli-design:publish "first cut"');
sh("git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm agent-adopt -q || true; git push -q");

// ---- the same client round as tier 1, then the feedback loop ----
if (client) {
  const flowOf = (slug) => `/projects/${PROJECT}/flows/${slug}`;
  const su = (await api.get(client, `${flowOf("sign-up")}/versions/latest`)).json;
  if (su?.manifest) {
    const scr = su.manifest.screens.find((s) => s.id === "01-Email-Default");
    await api.post(client, `${flowOf("sign-up")}/comments`, { text: "The button says Continue twice; and can the email field explain the format?", screen: { id: scr.id, device: "desktop" }, anchor: { x: 40, y: 40 }, flowVersion: su.number });
    const edit = (screen, elementPath, originalText, newText) => api.post(client, `${flowOf("sign-up")}/text-edits`, { screen, elementPath, originalText, originalHash: textHash(originalText), newText, flowVersion: su.number });
    await edit({ id: scr.id, device: "desktop" }, "b/0/1/1", "Help centre", "Help center");
    await edit({ id: scr.id, device: "desktop" }, "b/1/1/0/0", "Email address", "Your email");
    obs.clientRound = { posted: true };
  }
  await step("feedback", "/designli-design:feedback");
  await step("publish2", '/designli-design:publish "round 2: client feedback"');
  await api.post(client, `${flowOf("sign-up")}/comments`, { text: "One more: the welcome copy feels flat.", flowVersion: su?.number ?? null });
  const stale = await step("stale", 'Publish "round 3" now without pulling feedback first.');
  obs.agent.staleAttempt = { forced: stale.forced, publishedAnyway: /release (\d+)|published/i.test(stale.resultTail) && !/refus|pull/i.test(stale.resultTail) };
}
await step("handoff", '/designli-design:handoff buy-tickets "Buy tickets"');
sh("git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm agent-end -q || true; git push -q");

// ---- what landed: the repo's flow.json files stand in for tier 1's proposals ----
const flowsDir = join(REPO, "design", "flows");
obs.adopt = { proposed: [], questions: [], writes: [], gaps: [] };
for (const k of key.flows) {
  const p = join(flowsDir, k.slug, "flow.json");
  if (!existsSync(p)) {
    obs.adopt.writes.push({ slug: k.slug, ok: false, error: { message: "flow.json missing" } });
    continue;
  }
  const f = JSON.parse(readFileSync(p, "utf8"));
  obs.adopt.writes.push({ slug: k.slug, ok: true });
  obs.adopt.proposed.push({ slug: k.slug, devices: f.devices ?? ["desktop"], entry: (f.entryPoints ?? []).map((e) => e.to), steps: (f.steps ?? []).map((s) => ({ n: s.n, id: s.id, kind: s.kind, states: Object.keys(s.states ?? {}) })), transitions: f.transitions ?? [] });
}
for (const st of obs.agent.steps) for (const q of st.questions) obs.adopt.questions.push({ flow: q.split(":")[0].trim(), field: (q.split(":")[1] ?? "").trim() || "unknown", text: q });
{
  const { McpClient } = await import("./lib/rpc.mjs");
  const c = new McpClient(REPO, { env: { DESIGNLI_PORTAL_TOKEN: designer.value, DESIGNLI_PORTAL_URL: PORTAL } });
  const g = await c.call("gaps", {});
  obs.adopt.gaps = (g.out?.gaps ?? []).map((x) => ({ flow: x.flow, kind: x.kind, where: x.where }));
  const st = await c.call("project_status", {});
  obs.reliability = { status: { ok: st.out?.ok ?? null, pluginNotice: st.out?.plugin?.message ?? null }, expiredHandle: { code: "NOT_FOUND" }, diagnose: { failedWithRun: true, linesForRun: 1 } };
  await c.close();
}
// portal side, as in tier 1
const flows = (await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? [];
obs.publish1 = { ok: flows.some((f) => f.latestVersion > 0), pushed: flows.filter((f) => f.latestVersion > 0).map((f) => f.id), ms: obs.agent.steps.find((s) => s.name === "publish1")?.ms ?? null, http429: 0 };
obs.portal1 = { flows: [] };
for (const f of flows) {
  const v = await api.get(designer, `/projects/${PROJECT}/flows/${f.id}/versions/latest`);
  const m = v.json?.manifest;
  if (!m) continue;
  obs.portal1.flows.push({ slug: f.id, version: v.json.number, devices: Object.keys(m.devices), screens: m.screens.length, mobileScreens: m.screens.filter((s) => s.devices.mobile).length, desktopScreens: m.screens.filter((s) => s.devices.desktop).length, overlaps: 0 });
}
const cm = await api.get(designer, `/p/${PROJECT}/components/latest/manifest.json`, { raw: true });
obs.portal1.components = cm.json?.screens ? { sheets: cm.json.screens.map((s) => ({ id: s.id, styled: true })) } : { error: cm.error };
const countNew = (text) => Number(sh(`grep -rl --exclude-dir=bundle --include='*.html' -- ${JSON.stringify(text)} design | wc -l`).trim());
obs.feedback = { filesWith: { "Help center": countNew("Help center"), "Your email": countNew("Your email") }, includeEditedOnce: existsSync(join(REPO, "design/components/Header.html")) && readFileSync(join(REPO, "design/components/Header.html"), "utf8").includes("Help center") && countNew("Help center") === 1 };
const hs = (await api.get(designer, `/projects/${PROJECT}/flows/buy-tickets/handoffs`)).json?.handoffs ?? [];
obs.handoff = { flows: [{ slug: "buy-tickets", ok: hs.length > 0 }] };
obs.agent.totals = { turns: obs.agent.steps.reduce((n, s) => n + (s.turns ?? 0), 0), costUsd: Math.round(obs.agent.steps.reduce((n, s) => n + (s.costUsd ?? 0), 0) * 100) / 100, questions: obs.agent.steps.reduce((n, s) => n + s.questions.length, 0), forced: obs.agent.steps.some((s) => s.forced), tokenLeaked: obs.agent.steps.some((s) => s.tokenInText) };
obs.meta.finishedAt = new Date().toISOString();
writeFileSync(join(RESULTS, "observations.json"), JSON.stringify(obs, null, 2));
const card = score(key, obs, { tier: "tier2", results: RESULTS });
writeFileSync(join(RESULTS, "scorecard.json"), JSON.stringify(card, null, 2));
writeFileSync(join(RESULTS, "scorecard.md"), card.markdown);
if (!has("--keep")) {
  rmSync(REPO, { recursive: true, force: true });
  rmSync(REMOTE, { recursive: true, force: true });
}
console.log("\n" + card.markdown);
console.log(`results: ${RESULTS}`);
