#!/usr/bin/env node
// Client for the Designli design portal (REST contract in reference/portal-api.md). JSON on stdout; never echoes secrets.
//   node portal.mjs login-check [--url U]
//   node portal.mjs login --url U --token T            (stores ~/.config/designli-design/credentials.json, 0600)
//   node portal.mjs projects [--create ID --name N] [--url U]
//   node portal.mjs head --flow DIR [--project P]
//   node portal.mjs push --flow DIR [--project P] [--force] [--note "..."]
//   node portal.mjs components push --components DIR [--project P]
//   node portal.mjs pull --flow DIR [--project P] [--status open|resolved|all]
//   node portal.mjs reply --flow DIR --thread ID --text "..."     node portal.mjs resolve|reopen --flow DIR --thread ID
//   node portal.mjs edits --flow DIR [--status pending]           node portal.mjs mark-applied --flow DIR --ids a,b --version N
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, chmodSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { homedir } from "node:os";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const cmd = args[0]; const sub = args[1] && !args[1].startsWith("--") ? args[1] : null;
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);
const PLUGIN_VERSION = JSON.parse(readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8")).version;
const CRED = join(homedir(), ".config", "designli-design", "credentials.json");
const out = (o) => { console.log(JSON.stringify(o)); process.exit(o.ok === false ? 1 : 0); };
const fail = (message, extra = {}) => out({ ok: false, error: message, ...extra });

function library() { const p = resolve("design/library.json"); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {}; }
function flowJson(dir) { const p = join(dir, "flow.json"); if (!existsSync(p)) fail(`no flow.json in ${dir}`); return JSON.parse(readFileSync(p, "utf8")); }
function saveFlowJson(dir, j) { writeFileSync(join(dir, "flow.json"), JSON.stringify(j, null, 2) + "\n"); }
function creds() { try { return JSON.parse(readFileSync(CRED, "utf8")); } catch { return { portals: {} }; } }
function resolveUrl() { const u = opt("--url") || process.env.DESIGNLI_PORTAL_URL || library().publish?.portal?.url; if (!u) fail("no portal url: pass --url, set DESIGNLI_PORTAL_URL, or design/library.json.publish.portal.url"); return u.replace(/\/$/, ""); }
function resolveToken(url) { if (opt("--token")) return { token: opt("--token"), source: "flag" }; if (process.env.DESIGNLI_PORTAL_TOKEN) return { token: process.env.DESIGNLI_PORTAL_TOKEN, source: "env" }; const c = creds().portals?.[url]; if (c?.token) return { token: c.token, source: "credentials" }; return { token: null, source: null }; }
function resolveProject(dir) { const p = opt("--project") || (dir && flowJson(dir).portal?.projectId) || library().publish?.portal?.projectId; if (!p) fail("no project id: pass --project or set design/library.json.publish.portal.projectId"); return p; }

async function call(url, token, method, path, body, headers = {}, gzip = false) {
  const h = { "x-designli-client": `designli-design/${PLUGIN_VERSION}`, ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  let payload; if (body !== undefined) { const text = JSON.stringify(body); if (gzip) { payload = gzipSync(Buffer.from(text)); h["content-encoding"] = "gzip"; } else payload = text; h["content-type"] = "application/json"; }
  let res; try { res = await fetch(url + "/api/v1" + path, { method, headers: h, body: payload }); } catch (e) { fail(`cannot reach ${url}: ${e.message}`); }
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const agentHeaders = { "x-designli-on-behalf": "agent" };

function ensureBundle(dir, kind, compDir) {
  if (!existsSync(dir)) fail(`no such directory: ${dir}`);
  const bundleDir = join(dir, "bundle");
  const stale = !existsSync(join(bundleDir, "manifest.json")) || has("--rebuild") || (() => { const built = JSON.parse(readFileSync(join(bundleDir, "manifest.json"), "utf8")).generatedAt; const t = new Date(built).getTime(); return readdirSync(dir).filter(f => f.endsWith(".dc.html") || f === "canvas.json").some(f => statSync(join(dir, f)).mtimeMs > t); })();
  if (stale) { const a = kind === "flow" ? ["--flow", dir, ...(compDir ? ["--components", compDir] : []), "--json"] : ["--components", dir, "--kind", "components", "--json"]; const r = spawnSync(process.execPath, [new URL("./bundle.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" }); if (r.status !== 0) fail("bundle build failed", { output: (r.stdout + r.stderr).slice(-800) }); }
  const manifest = JSON.parse(readFileSync(join(bundleDir, "manifest.json"), "utf8"));
  const files = readdirSync(join(bundleDir, "screens")).filter(f => f.endsWith(".html")).sort().map(f => ({ path: `screens/${f}`, encoding: "utf8", content: readFileSync(join(bundleDir, "screens", f), "utf8") }));
  return { manifest, files, bundleDir };
}

function writeCommentsFile(dir, url, project, flow, threads) {
  const p = join(dir, "comments.json"); let cur = { schema: 1, flow, source: "portal", threads: [] };
  try { cur = JSON.parse(readFileSync(p, "utf8")); } catch {}
  const byId = new Map((cur.threads || []).map(t => [t.id, t]));
  for (const t of threads) { const prev = byId.get(t.id); if (!prev || new Date(t.updatedAt) >= new Date(prev.updatedAt)) byId.set(t.id, t); }
  const next = { schema: 1, flow, source: "portal", portal: { url, projectId: project, flowId: flow }, pulledAt: new Date().toISOString(), threads: [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
  writeFileSync(p, JSON.stringify(next, null, 2) + "\n"); return next;
}

(async () => {
  if (!cmd || has("--help")) { console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 12).join("\n")); process.exit(0); }
  const url = resolveUrl(); const { token, source } = resolveToken(url);
  if (cmd === "login") { if (!opt("--token")) fail("login needs --token"); const c = creds(); c.portals = c.portals || {}; c.portals[url] = { token: opt("--token"), savedAt: new Date().toISOString() }; mkdirSync(join(homedir(), ".config", "designli-design"), { recursive: true, mode: 0o700 }); writeFileSync(CRED, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 }); chmodSync(CRED, 0o600); }
  if (cmd === "login" || cmd === "login-check") { const t = cmd === "login" ? opt("--token") : token; if (!t) out({ ok: false, url, tokenSource: null, error: "no token: set DESIGNLI_PORTAL_TOKEN or run portal.mjs login --url <url> --token <token>" }); const r = await call(url, t, "GET", "/me"); if (r.status !== 200) out({ ok: false, url, tokenSource: cmd === "login" ? "credentials" : source, status: r.status, error: r.json?.error?.message || r.text.slice(0, 200) }); out({ ok: true, url, tokenSource: cmd === "login" ? "credentials" : source, user: r.json.user, memberships: r.json.memberships }); }
  if (!token) fail("no token: set DESIGNLI_PORTAL_TOKEN or run portal.mjs login", { url });

  if (cmd === "projects") { if (opt("--create")) { const r = await call(url, token, "POST", "/projects", { id: opt("--create"), name: opt("--name") || opt("--create"), accessCode: opt("--access-code") }); if (r.status !== 201) fail(r.json?.error?.message || "create failed", { status: r.status }); out({ ok: true, created: r.json }); } const r = await call(url, token, "GET", "/projects"); if (r.status !== 200) fail(r.json?.error?.message || "list failed", { status: r.status }); out({ ok: true, projects: r.json.projects }); }

  const dir = opt("--flow") ? resolve(opt("--flow")) : null;
  if (cmd === "components" && sub === "push") {
    const cdir = resolve(opt("--components", "design/components")); const project = resolveProject(null);
    const { manifest, files } = ensureBundle(cdir, "components");
    const r = await call(url, token, "POST", `/projects/${project}/components/versions`, { manifest, files }, {}, true);
    if (![200, 201].includes(r.status)) fail(r.json?.error?.message || "push failed", { status: r.status, details: r.json?.error?.details });
    out({ ok: true, project, ...r.json });
  }
  if (!dir) fail(`${cmd} needs --flow <dir>`);
  const flow = flowJson(dir); const project = resolveProject(dir); const slug = flow.slug;

  if (cmd === "head") { const r = await call(url, token, "GET", `/projects/${project}/flows/${slug}/head`); if (r.status === 404) out({ ok: true, project, flow: slug, exists: false, version: 0 }); if (r.status !== 200) fail(r.json?.error?.message || "head failed", { status: r.status }); out({ ok: true, project, flow: slug, exists: true, ...r.json, local: { version: flow.portal?.version ?? 0, lastPullAt: flow.portal?.lastPullAt ?? null } }); }

  if (cmd === "push") {
    const compDir = existsSync(resolve("design/components")) ? resolve("design/components") : null;
    const { manifest, files, bundleDir } = ensureBundle(dir, "flow", compDir);
    const headRes = await call(url, token, "GET", `/projects/${project}/flows/${slug}/head`);
    const remoteHead = headRes.status === 200 ? headRes.json.version : 0;
    const localHead = flow.portal?.version ?? 0;
    const ifMatch = has("--force") ? String(remoteHead) : String(localHead);
    const headers = { "if-match": ifMatch }; if (flow.portal?.lastPullAt) headers["x-designli-last-pull"] = flow.portal.lastPullAt;
    const r = await call(url, token, "POST", `/projects/${project}/flows/${slug}/versions${has("--force") ? "?force=1" : ""}${opt("--note") ? (has("--force") ? "&" : "?") + "note=" + encodeURIComponent(opt("--note")) : ""}`, { manifest, files }, headers, true);
    if (r.status === 409) out({ ok: false, stale: true, project, flow: slug, remoteHead, localHead, error: r.json?.error?.message, details: r.json?.error?.details, hint: "run: node portal.mjs pull --flow " + relative(process.cwd(), dir) + "  (then review and push again; --force overrides)" });
    if (![200, 201].includes(r.status)) fail(r.json?.error?.message || "push failed", { status: r.status, details: r.json?.error?.details });
    flow.portal = { url, projectId: project, flowId: slug, version: r.json.version, contentHash: r.json.contentHash, shareUrl: r.json.url, pushedAt: new Date().toISOString(), lastPullAt: flow.portal?.lastPullAt ?? new Date().toISOString() };
    saveFlowJson(dir, flow);
    manifest.publish = { target: "portal", ...flow.portal }; writeFileSync(join(bundleDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    out({ ok: true, project, flow: slug, version: r.json.version, reused: r.json.reused, url: r.json.url, contentHash: r.json.contentHash });
  }

  if (cmd === "pull") {
    const status = opt("--status", "all"); const q = `?status=${status}`;
    const r = await call(url, token, "GET", `/projects/${project}/flows/${slug}/comments${q}`);
    if (r.status !== 200) fail(r.json?.error?.message || "pull failed", { status: r.status });
    const e = await call(url, token, "GET", `/projects/${project}/flows/${slug}/text-edits?status=all`);
    const threads = r.json.threads || []; const edits = e.status === 200 ? (e.json.edits || []) : [];
    const file = writeCommentsFile(dir, url, project, slug, threads);
    writeFileSync(join(dir, "text-edits.json"), JSON.stringify({ schema: 1, flow: slug, pulledAt: new Date().toISOString(), edits }, null, 2) + "\n");
    const head = await call(url, token, "GET", `/projects/${project}/flows/${slug}/head`);
    flow.portal = { ...(flow.portal || { url, projectId: project, flowId: slug }), lastPullAt: r.json.serverTime || new Date().toISOString(), remoteVersion: head.json?.version ?? null }; saveFlowJson(dir, flow);
    out({ ok: true, project, flow: slug, pulled: threads.length, open: threads.filter(t => t.status === "open").length, unmapped: threads.filter(t => !t.screen).map(t => t.id), textEdits: edits.length, pendingEdits: edits.filter(x => x.status === "pending").length, remoteVersion: head.json?.version ?? null, localVersion: flow.portal?.version ?? 0 });
  }
  if (cmd === "reply") { const r = await call(url, token, "POST", `/projects/${project}/flows/${slug}/comments/${opt("--thread")}/replies`, { text: opt("--text") }, agentHeaders); if (r.status !== 201) fail(r.json?.error?.message || "reply failed", { status: r.status }); out({ ok: true, thread: opt("--thread"), reply: r.json }); }
  if (cmd === "resolve" || cmd === "reopen") { const r = await call(url, token, "POST", `/projects/${project}/flows/${slug}/comments/${opt("--thread")}/${cmd}`, {}, agentHeaders); if (r.status !== 200) fail(r.json?.error?.message || `${cmd} failed`, { status: r.status }); out({ ok: true, thread: r.json }); }
  if (cmd === "edits") { const r = await call(url, token, "GET", `/projects/${project}/flows/${slug}/text-edits?status=${opt("--status", "pending")}`); if (r.status !== 200) fail(r.json?.error?.message || "edits failed", { status: r.status }); out({ ok: true, edits: r.json.edits }); }
  if (cmd === "mark-applied") { const ids = (opt("--ids") || "").split(",").filter(Boolean); const r = await call(url, token, "POST", `/projects/${project}/flows/${slug}/text-edits/mark-applied`, { ids, version: Number(opt("--version")) }, agentHeaders); if (r.status !== 200) fail(r.json?.error?.message || "mark-applied failed", { status: r.status }); out({ ok: true, ...r.json }); }
  fail(`unknown command ${cmd}`);
})();
