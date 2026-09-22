// Shared by `scripts/setup.mjs` (the interactive CLI) and the MCP server's setup tools. Pure file
// and HTTP helpers: nothing here prints, asks or exits; the token is never written to a repo file.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, hostname } from "node:os";
import { basename } from "node:path";

export const PLUGIN_ROOT = resolve(import.meta.dirname, "..", "..");
export const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"),
).version;
export const CRED_DIR = join(homedir(), ".config", "designli-design");
export const CRED_FILE = join(CRED_DIR, "credentials.json");
export const DEFAULT_PORTAL = "https://portal.designli.co";

export function normalizeUrl(u) {
  return String(u || "")
    .trim()
    .replace(/\/+$/, "");
}
/** https only, except local development. */
export function urlAllowed(url) {
  return /^https:\/\/[^/]+/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url);
}
export function looksLikeToken(t) {
  return /^dpat_[A-Za-z0-9_-]{16,}$/.test(String(t || "").trim());
}
export function readCredentials() {
  try {
    return JSON.parse(readFileSync(CRED_FILE, "utf8"));
  } catch {
    return { portals: {} };
  }
}
export function tokenFor(url) {
  if (process.env.DESIGNLI_PORTAL_TOKEN)
    return { token: process.env.DESIGNLI_PORTAL_TOKEN, source: "env" };
  const c = readCredentials().portals?.[normalizeUrl(url)];
  return c?.token
    ? { token: c.token, source: "credentials", savedAt: c.savedAt }
    : { token: null, source: null };
}
export function storeToken(url, token) {
  const c = readCredentials();
  c.portals = c.portals || {};
  c.portals[normalizeUrl(url)] = { token, savedAt: new Date().toISOString() };
  mkdirSync(CRED_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CRED_FILE, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 });
  chmodSync(CRED_FILE, 0o600);
  return CRED_FILE;
}
export function forgetToken(url) {
  const c = readCredentials();
  if (c.portals?.[normalizeUrl(url)]) {
    delete c.portals[normalizeUrl(url)];
    writeFileSync(CRED_FILE, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 });
    return true;
  }
  return false;
}

/** Answer-header listener set by portal.mjs so every call, even these thin ones, feeds portalMeta. */
export const headerListeners = [];
const noteHeaders = (h) => headerListeners.forEach((f) => f(h));
export async function portalGet(url, token, path) {
  let res;
  try {
    res = await fetch(url + "/api/v1" + path, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-designli-client": `designli-design/${PLUGIN_VERSION}`,
      },
    });
  } catch (e) {
    return { status: 0, json: null, error: `cannot reach ${url}: ${e.message}` };
  }
  noteHeaders(res.headers);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: res.status,
    json,
    error: res.ok ? null : json?.error?.message || text.slice(0, 200),
  };
}
// ---- plugin version: the portal says what is current; the update itself is Claude Code's job ----
export const UPDATE_COMMANDS = [
  "/plugin marketplace update designli-tools",
  "/plugin update designli-design@designli-tools",
];
/** Numeric, segment by segment ("0.10.0" > "0.9.1"); a prerelease sorts before the bare version. */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = String(v ?? "")
      .trim()
      .replace(/^v/, "")
      .match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/);
    return m ? { nums: m[1].split(".").map(Number), pre: m[2] ?? null } : null;
  };
  const x = parse(a),
    y = parse(b);
  if (!x || !y) return 0;
  const n = Math.max(x.nums.length, y.nums.length);
  for (let i = 0; i < n; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (x.pre && !y.pre) return -1;
  if (!x.pre && y.pre) return 1;
  if (x.pre && y.pre) return x.pre < y.pre ? -1 : x.pre > y.pre ? 1 : 0;
  return 0;
}
/** What to tell the designer about this plugin's version, given what the portal reported. */
export function updateAdvice({ latest = null, minimum = null } = {}) {
  const version = PLUGIN_VERSION;
  const updateAvailable = !!latest && compareVersions(version, latest) < 0;
  const updateRequired = !!minimum && compareVersions(version, minimum) < 0;
  const commands = UPDATE_COMMANDS;
  const message = updateRequired
    ? `This plugin (${version}) is older than the portal supports (${minimum}). Update before anything else: in Claude Code run ${commands.join(" then ")}, then restart Claude Code.`
    : updateAvailable
      ? `A newer plugin is available (${latest}; you run ${version}): in Claude Code run ${commands.join(" then ")}, then restart Claude Code.`
      : null;
  return { version, latest, minimum, updateAvailable, updateRequired, commands, message };
}
// ---- device sign-in: the token is approved in the browser, never typed ----
/** What the workflow needs: publish, pull feedback, answer threads, waive states. */
export const DEVICE_PERMISSIONS = ["view", "comment", "suggest_copy", "push", "resolve", "manage_flows"];
export const DEVICE_EXPIRY_DAYS = 90;
/** "acme-proto (designli-design on gabriel-mbp)": what the approval page shows. */
export const deviceLabel = (project) =>
  `${basename(project)} (designli-design on ${hostname().replace(/\.local$/, "")})`.slice(0, 60);
async function devicePost(url, path, body) {
  let res;
  try {
    res = await fetch(url + "/api/v1/device" + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-designli-client": `designli-design/${PLUGIN_VERSION}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { status: 0, json: null, error: `cannot reach ${url}: ${e.message}` };
  }
  noteHeaders(res.headers);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: res.status,
    json,
    error: res.ok ? null : json?.error?.message || text.slice(0, 200),
  };
}
/**
 * Opens a sign-in request. Returns { ok, deviceCode, userCode, verificationUrl,
 * verificationUrlComplete, expiresIn, interval } or { ok: false, status, error, unsupported }
 * (unsupported: the portal predates device sign-in).
 */
export async function deviceStart(url, { projectId, permissions, expiresInDays, label } = {}) {
  const r = await devicePost(url, "/start", {
    label: label || "designli-design",
    projects: projectId ? [projectId] : null,
    permissions: permissions ?? DEVICE_PERMISSIONS,
    expiresInDays: expiresInDays === undefined ? DEVICE_EXPIRY_DAYS : expiresInDays,
    client: label || "designli-design",
  });
  if (r.status !== 201)
    return { ok: false, status: r.status, error: r.error, unsupported: r.status === 404 };
  return { ok: true, ...r.json };
}
/** One poll: { status: "pending" | "denied" | "expired" | "gone" | "approved", token? } or { status: "error", error }. */
export async function devicePoll(url, deviceCode) {
  const r = await devicePost(url, "/poll", { deviceCode });
  // the request itself is gone (answered already, or never existed); any other failure is reported
  if (r.status === 404 && /device code/i.test(r.error || "")) return { status: "gone" };
  if (r.status !== 200) return { status: "error", error: r.error };
  return r.json;
}
/**
 * Polls until the request is answered or `waitSeconds` pass. On approval the token is stored and
 * verified; the result never carries it: { status: "approved", credentialsFile, me } | { status }.
 */
export async function deviceWait(url, deviceCode, { interval = 5, waitSeconds = 30, store = true } = {}) {
  const until = Date.now() + waitSeconds * 1000;
  for (;;) {
    const r = await devicePoll(url, deviceCode);
    if (r.status === "approved") {
      const me = await whoami(url, r.token);
      if (!me.ok) return { status: "error", error: `the new token was refused: ${me.error}` };
      const credentialsFile = store ? storeToken(url, r.token) : null;
      return { status: "approved", credentialsFile, me, ...(store ? {} : { token: r.token }) };
    }
    if (r.status !== "pending") return r;
    if (Date.now() + interval * 1000 > until) return { status: "pending" };
    await new Promise((res) => setTimeout(res, interval * 1000));
  }
}
/** Identity, scope and the projects the token can see. */
export async function whoami(url, token) {
  const me = await portalGet(url, token, "/me");
  if (me.status !== 200) return { ok: false, status: me.status, error: me.error };
  const projects = [];
  let page = 1;
  for (;;) {
    const r = await portalGet(url, token, `/projects?limit=100&page=${page}`);
    if (r.status !== 200) break;
    projects.push(...(r.json.projects || []));
    if (page >= (r.json.pageCount || 1)) break;
    page++;
  }
  return {
    ok: true,
    user: me.json.user,
    memberships: me.json.memberships,
    scope: me.json.scope ?? null,
    projects,
  };
}

// ---- repo files ----
export function libraryPath(project) {
  return join(project, "design", "library.json");
}
export function readLibrary(project) {
  const p = libraryPath(project);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
/** Writes publish.{target, portal} into design/library.json, creating a minimal file when absent. */
export function writePublish(project, { url, projectId, target = "portal" }) {
  const p = libraryPath(project);
  const lib = readLibrary(project) ?? { createdAt: new Date().toISOString() };
  lib.publish =
    target === "portal" ? { target, portal: { url: normalizeUrl(url), projectId } } : { target };
  mkdirSync(join(project, "design"), { recursive: true });
  writeFileSync(p, JSON.stringify(lib, null, 2) + "\n");
  return p;
}
/**
 * The MCP servers a client needs. The portal one always; the local plugin server only when the
 * client does not get it from the Claude Code plugin itself (which registers it via its .mcp.json).
 * Token by env expansion only.
 */
export function mcpServers({ url, target = "portal", includeLocal = true }) {
  const servers = {};
  if (includeLocal)
    servers["designli-design"] = {
      command: "node",
      args: [join(PLUGIN_ROOT, "server", "index.mjs")],
      env: { DESIGNLI_PORTAL_URL: normalizeUrl(url) },
    };
  if (target === "portal")
    servers["designli-portal"] = {
      type: "http",
      url: normalizeUrl(url) + "/mcp",
      headers: { Authorization: "Bearer ${DESIGNLI_PORTAL_TOKEN}" },
    };
  return servers;
}
/** .mcp.json in the repo (Claude Code reads it; the shape is the common one). Merges, never overwrites other servers. */
export function writeMcpJson(project, servers) {
  const p = join(project, ".mcp.json");
  let cur = {};
  if (existsSync(p)) {
    try {
      cur = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      throw new Error(`${p} is not valid JSON; fix it before setup writes to it`);
    }
  }
  cur.mcpServers = { ...(cur.mcpServers || {}), ...servers };
  const text = JSON.stringify(cur, null, 2) + "\n";
  if (/dpat_[A-Za-z0-9_-]{8,}/.test(text))
    throw new Error("refusing to write a literal token into .mcp.json");
  writeFileSync(p, text);
  return p;
}
const IGNORE_BLOCK = [
  "design/**/bundle/",
  "design/**/.seed/",
  "design/**/.review/",
  ".mcp.local.json",
];
export function ensureGitignore(project) {
  const p = join(project, ".gitignore");
  const cur = existsSync(p) ? readFileSync(p, "utf8") : "";
  const missing = IGNORE_BLOCK.filter((l) => !cur.split("\n").includes(l));
  if (!missing.length) return { path: p, added: [] };
  writeFileSync(
    p,
    cur.replace(/\n*$/, "\n") +
      "\n# designli-design build outputs and local MCP config\n" +
      missing.join("\n") +
      "\n",
  );
  return { path: p, added: missing };
}
