// Shared by `scripts/setup.mjs` (the interactive CLI) and the MCP server's setup tools. Pure file
// and HTTP helpers: nothing here prints, asks or exits; the token is never written to a repo file.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

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
/** What to do next, from the state of the repo and the portal. */
export function nextSteps({ greenfield, hasDna, localFlows, portalFlows, harness }) {
  const prompt = (name, args = "") =>
    harness === "claude"
      ? `/designli-design:${name}${args ? " " + args : ""}  (or the MCP prompt /mcp__designli-design__${name})`
      : `the \`${name}\` prompt of the designli-design MCP server${args ? " with " + args : ""}`;
  const steps = [];
  if (!hasDna) {
    steps.push(
      greenfield
        ? `New product, no code yet: run ${prompt("init")} to interview the designer and author the design system (PRODUCT.md, DESIGN.md, tokens, the Components sheet).`
        : `Existing codebase without design DNA: run ${prompt("init")} to document the real tokens and components into PRODUCT.md and DESIGN.md.`,
    );
    steps.push(
      `Then design the first journey: ${prompt("flow", '"<what the user is trying to do>"')}.`,
    );
  } else if (portalFlows.length && localFlows.length) {
    steps.push(
      `Flows exist locally and on the portal: pull feedback per flow (\`portal_pull\`), then ${prompt("review", "<slug>")} for each flow with open comments: ${portalFlows.map((f) => `${f.id} (${f.openThreads} open)`).join(", ")}.`,
    );
    steps.push(
      `If the codebase changed since the design DNA was written, run ${prompt("init", "--refresh")} first.`,
    );
  } else if (localFlows.length) {
    steps.push(
      `Local flows are not on the portal yet: push each one with \`portal_push\` (${localFlows.join(", ")}), then share the project with the client from the portal.`,
    );
  } else if (portalFlows.length) {
    steps.push(
      `The portal has flows this repo does not: pull the sources from your team's repository, or start a new flow with ${prompt("flow", '"<brief>"')}.`,
    );
  } else {
    steps.push(
      `Design DNA is in place. Start the first journey: ${prompt("flow", '"<what the user is trying to do>"')}.`,
    );
  }
  steps.push(
    `When a flow is reviewed and ready for developers: ${prompt("handoff", '<slug> "<story title>"')}.`,
  );
  return steps;
}
