#!/usr/bin/env node
// The designli-design MCP server: the plugin as tools, resources and prompts for any MCP client.
// stdio transport (newline-delimited JSON-RPC 2.0), protocol 2025-03-26, no dependencies.
//   node server/index.mjs [--project <dir>]
// Tools run the plugin's own scripts (they already speak JSON); the token is never an argument:
// it comes from DESIGNLI_PORTAL_TOKEN or the user's 0600 credentials file.
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PLUGIN_ROOT,
  PLUGIN_VERSION,
  DEFAULT_PORTAL,
  normalizeUrl,
  urlAllowed,
  tokenFor,
  whoami,
  readLibrary,
  writePublish,
  mcpServers,
  writeMcpJson,
  ensureGitignore,
  nextSteps,
  CRED_FILE,
} from "./lib/setup.mjs";

const PROTOCOL = "2025-03-26";
const argv = process.argv.slice(2);
const argOf = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PROJECT = resolve(argOf("--project") || process.env.DESIGNLI_PROJECT_DIR || process.cwd());
const script = (name) => join(PLUGIN_ROOT, "scripts", name);

// ---- running the plugin scripts ----
function run(name, args, { cwd = PROJECT, input } = {}) {
  return new Promise((res) => {
    const child = spawn(process.execPath, [script(name), ...args], {
      cwd,
      env: { ...process.env, DESIGNLI_PROJECT_DIR: PROJECT },
      stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on("close", (code) => {
      let json = null;
      // the scripts print one JSON object last; anything before it is progress
      const lines = out.trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          json = JSON.parse(lines.slice(i).join("\n"));
          break;
        } catch {}
      }
      res({ code, json, stdout: out, stderr: err });
    });
  });
}
class ToolError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
const fromScript = (r, what) => {
  if (r.json && r.json.ok !== false && r.code === 0) return r.json;
  if (r.json && r.json.ok === false)
    throw new ToolError(
      r.json.stale
        ? "STALE_LOCAL"
        : r.json.status === 401
          ? "UNAUTHORIZED"
          : r.json.status === 403
            ? "FORBIDDEN"
            : "SCRIPT",
      r.json.error || `${what} failed`,
      r.json,
    );
  if (r.json) return r.json;
  throw new ToolError(
    "SCRIPT",
    `${what} failed (exit ${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 500)}`,
  );
};
const flowDir = (flow) => {
  if (!flow)
    throw new ToolError(
      "VALIDATION",
      "flow is required (a slug under design/flows, or a directory)",
    );
  const p = existsSync(resolve(PROJECT, flow))
    ? resolve(PROJECT, flow)
    : resolve(PROJECT, "design", "flows", flow);
  if (!existsSync(join(p, "flow.json")))
    throw new ToolError("NOT_FOUND", `no flow.json under ${p}`);
  return p;
};
const portalUrl = () =>
  normalizeUrl(process.env.DESIGNLI_PORTAL_URL || readLibrary(PROJECT)?.publish?.portal?.url || "");
const componentsArg = () =>
  existsSync(join(PROJECT, "design", "components")) ? ["--components", "design/components"] : [];

// ---- tools ----
const str = (description) => ({ type: "string", description });
const TOOLS = [
  {
    name: "project_status",
    description:
      "Where this repository stands: Node, impeccable install, design DNA (PRODUCT.md, DESIGN.md, design.json), design/library.json, flows with their pushed version, publish target, credentials source, harness config. Call this first. CLI: scripts/preflight.mjs --json",
    inputSchema: {
      type: "object",
      properties: { require: str("comma list: impeccable,dna,library") },
    },
    run: async (a) => {
      const r = await run("preflight.mjs", [
        "--json",
        ...(a.require ? ["--require", a.require] : []),
      ]);
      const s = r.json ?? {
        ok: false,
        blockers: [{ code: "PREFLIGHT", message: r.stderr.slice(0, 300) }],
      };
      const url = portalUrl();
      const flows = [];
      for (const slug of s.info?.flows ?? []) {
        const fj = join(PROJECT, "design", "flows", slug, "flow.json");
        try {
          const f = JSON.parse(readFileSync(fj, "utf8"));
          flows.push({
            slug,
            title: f.title,
            status: f.status,
            pushedVersion: f.portal?.version ?? null,
            lastPullAt: f.portal?.lastPullAt ?? null,
          });
        } catch {
          flows.push({ slug, error: "flow.json unreadable" });
        }
      }
      return {
        ...s,
        project: PROJECT,
        portalUrl: url || null,
        flows,
        harness: readLibrary(PROJECT)?.harness ?? null,
        mcpJson: existsSync(join(PROJECT, ".mcp.json")),
      };
    },
  },
  {
    name: "credentials_status",
    description:
      "Whether a portal token is available (env DESIGNLI_PORTAL_TOKEN or the 0600 credentials file) and who it belongs to, with its scope and expiry. Never returns the token. CLI: scripts/portal.mjs login-check",
    inputSchema: {
      type: "object",
      properties: { url: str("Portal URL; default from the environment or design/library.json") },
    },
    run: async (a) => {
      const url = normalizeUrl(a.url || portalUrl() || DEFAULT_PORTAL);
      const { token, source, savedAt } = tokenFor(url);
      if (!token)
        return {
          ok: false,
          url,
          tokenSource: null,
          howTo: `Mint a scoped token on ${url}/account, then run: node ${script("setup.mjs")}  (or export DESIGNLI_PORTAL_TOKEN=... before starting the agent)`,
          credentialsFile: CRED_FILE,
        };
      const me = await whoami(url, token);
      if (!me.ok)
        return { ok: false, url, tokenSource: source, status: me.status, error: me.error };
      return {
        ok: true,
        url,
        tokenSource: source,
        savedAt: savedAt ?? null,
        user: me.user,
        scope: me.scope,
        projects: me.projects.map((p) => ({
          id: p.id,
          name: p.name,
          preset: p.preset,
          permissions: p.permissions,
        })),
      };
    },
  },
  {
    name: "portal_projects",
    description:
      "Projects the token can access (id, name, preset, permissions). With create: {id, name} an admin token creates one. CLI: scripts/portal.mjs projects",
    inputSchema: {
      type: "object",
      properties: {
        create: { type: "object", properties: { id: str(), name: str() }, required: ["id"] },
      },
    },
    run: async (a) => {
      const url = portalUrl() || DEFAULT_PORTAL;
      if (a.create)
        return fromScript(
          await run("portal.mjs", [
            "projects",
            "--url",
            url,
            "--create",
            a.create.id,
            "--name",
            a.create.name || a.create.id,
          ]),
          "create project",
        );
      const { token } = tokenFor(url);
      if (!token)
        throw new ToolError("PORTAL_TOKEN", "no token: run credentials_status for instructions");
      const me = await whoami(url, token);
      if (!me.ok) throw new ToolError(me.status === 401 ? "UNAUTHORIZED" : "PORTAL", me.error);
      return {
        url,
        projects: me.projects.map((p) => ({
          id: p.id,
          name: p.name,
          preset: p.preset,
          permissions: p.permissions,
          flowCount: p.flowCount,
        })),
      };
    },
  },
  {
    name: "setup_write",
    description:
      "Connects the repository to a portal project: writes design/library.json publish (+ harness), the repo .mcp.json for Claude Code (token by ${DESIGNLI_PORTAL_TOKEN} expansion, never literal), and .gitignore entries. Returns nextSteps. Never touches credentials.",
    inputSchema: {
      type: "object",
      properties: {
        url: str("Portal URL (https; http only for localhost)"),
        projectId: str("Project id on the portal"),
        harness: {
          type: "string",
          enum: ["claude", "generic", "none"],
          description:
            "claude writes .mcp.json; generic returns the config to paste; none writes only library.json",
        },
        target: { type: "string", enum: ["portal", "local"] },
      },
      required: ["projectId"],
    },
    run: async (a) => {
      const url = normalizeUrl(a.url || portalUrl() || DEFAULT_PORTAL);
      const target = a.target || "portal";
      if (target === "portal" && !urlAllowed(url))
        throw new ToolError(
          "VALIDATION",
          `refusing ${url}: use https (http is allowed for localhost only)`,
        );
      const harness = a.harness || "none";
      const written = [writePublish(PROJECT, { url, projectId: a.projectId, target })];
      const lib = readLibrary(PROJECT);
      lib.harness = harness;
      writePublish(PROJECT, { url, projectId: a.projectId, target });
      const libPath = join(PROJECT, "design", "library.json");
      const l2 = JSON.parse(readFileSync(libPath, "utf8"));
      l2.harness = harness;
      (await import("node:fs")).writeFileSync(libPath, JSON.stringify(l2, null, 2) + "\n");
      const servers = mcpServers({ url, target, includeLocal: harness !== "claude" });
      if (harness === "claude") written.push(writeMcpJson(PROJECT, servers));
      const gi = ensureGitignore(PROJECT);
      if (gi.added.length) written.push(gi.path);
      const status = await run("preflight.mjs", ["--json"]);
      const info = status.json?.info ?? {};
      let portalFlows = [];
      if (target === "portal") {
        const { token } = tokenFor(url);
        if (token) {
          const r = await fetch(`${url}/api/v1/projects/${a.projectId}/flows`, {
            headers: { authorization: `Bearer ${token}` },
          }).catch(() => null);
          if (r?.ok)
            portalFlows = ((await r.json()).flows || []).map((f) => ({
              id: f.id,
              openThreads: f.openThreads,
              pendingEdits: f.pendingEdits,
              version: f.latestVersion,
            }));
        }
      }
      return {
        ok: true,
        written: [...new Set(written)],
        mcpServers: servers,
        nextSteps: nextSteps({
          greenfield: !!info.greenfield,
          hasDna: !!(info.dna?.PRODUCT && info.dna?.DESIGN && info.dna?.designJson),
          localFlows: info.flows ?? [],
          portalFlows,
          harness,
        }),
      };
    },
  },
  {
    name: "preflight",
    description:
      "The doctor: blockers and warnings for a verb. CLI: scripts/preflight.mjs --require <list> --json",
    inputSchema: {
      type: "object",
      properties: { require: str("comma list: impeccable,dna,library") },
    },
    run: async (a) =>
      (await run("preflight.mjs", ["--json", ...(a.require ? ["--require", a.require] : [])])).json,
  },
  {
    name: "flow_check",
    description:
      "Validates a flow directory (naming, states coverage, artboard rules, tokens, canvas, spec sections, bundle freshness, publish evidence). CLI: scripts/flow-check.mjs --flow <dir> [--strict] [--design-only] --json",
    inputSchema: {
      type: "object",
      properties: {
        flow: str("Flow slug or directory"),
        strict: { type: "boolean" },
        designOnly: { type: "boolean", description: "Check only the design DNA files" },
        allowLocal: { type: "boolean" },
      },
    },
    run: async (a) => {
      const args = a.designOnly
        ? ["--design-only", "--json"]
        : [
            "--flow",
            flowDir(a.flow),
            "--json",
            ...(a.strict ? ["--strict"] : []),
            ...(a.allowLocal ? ["--allow-local"] : []),
          ];
      const r = await run("flow-check.mjs", args);
      return r.json ?? fromScript(r, "flow-check");
    },
  },
  {
    name: "bundle",
    description:
      "Flattens a flow (or the components sheet) into bundle/: static screens plus manifest.json with the content hash. CLI: scripts/bundle.mjs --flow <dir> [--components design/components] --json",
    inputSchema: {
      type: "object",
      properties: {
        flow: str("Flow slug or directory"),
        components: str("Components directory; set instead of flow to bundle the sheet"),
      },
    },
    run: async (a) => {
      const args =
        a.flow && !a.components
          ? ["--flow", flowDir(a.flow), ...componentsArg(), "--json"]
          : ["--components", a.components || "design/components", "--kind", "components", "--json"];
      return fromScript(await run("bundle.mjs", args), "bundle");
    },
  },
  {
    name: "tokens_css",
    description:
      "Generates design/tokens.css from DESIGN.md's frontmatter. CLI: scripts/tokens-css.mjs",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const r = await run("tokens-css.mjs", []);
      if (r.code !== 0) throw new ToolError("SCRIPT", r.stderr || r.stdout);
      return { ok: true, output: r.stdout.trim() };
    },
  },
  {
    name: "portal_head",
    description:
      "Head version and feedback counts of a flow on the portal; exists:false when never pushed. CLI: scripts/portal.mjs head --flow <dir>",
    inputSchema: { type: "object", properties: { flow: str() }, required: ["flow"] },
    run: async (a) =>
      fromScript(await run("portal.mjs", ["head", "--flow", flowDir(a.flow)]), "head"),
  },
  {
    name: "portal_pull",
    description:
      "Pulls every comment thread and copy edit of a flow into comments.json and text-edits.json, records the pull time and adopts the portal's journey order. CLI: scripts/portal.mjs pull --flow <dir> --status all",
    inputSchema: {
      type: "object",
      properties: { flow: str(), status: { type: "string", enum: ["open", "resolved", "all"] } },
      required: ["flow"],
    },
    run: async (a) =>
      fromScript(
        await run("portal.mjs", ["pull", "--flow", flowDir(a.flow), "--status", a.status || "all"]),
        "pull",
      ),
  },
  {
    name: "portal_push",
    description:
      "Bundles (if stale) and pushes a flow with If-Match and the last pull time; marks locally applied copy edits applied. STALE_LOCAL means pull first. force only when a human asked. CLI: scripts/portal.mjs push --flow <dir> [--force] [--note ...]",
    inputSchema: {
      type: "object",
      properties: { flow: str(), note: str("What changed"), force: { type: "boolean" } },
      required: ["flow"],
    },
    run: async (a) =>
      fromScript(
        await run("portal.mjs", [
          "push",
          "--flow",
          flowDir(a.flow),
          ...(a.force ? ["--force"] : []),
          ...(a.note ? ["--note", a.note] : []),
        ]),
        "push",
      ),
  },
  {
    name: "portal_components_push",
    description:
      "Pushes the components sheet. CLI: scripts/portal.mjs components push --components design/components",
    inputSchema: { type: "object", properties: { components: str("default design/components") } },
    run: async (a) =>
      fromScript(
        await run("portal.mjs", [
          "components",
          "push",
          "--components",
          a.components || "design/components",
        ]),
        "components push",
      ),
  },
  {
    name: "edits_apply",
    description:
      "Applies pending customer copy edits from text-edits.json to the .dc.html sources (both device variants when unambiguous); returns what needs a manual edit. CLI: scripts/portal.mjs edits apply --flow <dir>",
    inputSchema: { type: "object", properties: { flow: str() }, required: ["flow"] },
    run: async (a) =>
      fromScript(
        await run("portal.mjs", ["edits", "apply", "--flow", flowDir(a.flow)]),
        "edits apply",
      ),
  },
  {
    name: "portal_reply",
    description:
      "Replies to a comment thread as the agent. CLI: scripts/portal.mjs reply --flow <dir> --thread <id> --text ...",
    inputSchema: {
      type: "object",
      properties: { flow: str(), thread: str(), text: str() },
      required: ["flow", "thread", "text"],
    },
    run: async (a) =>
      fromScript(
        await run("portal.mjs", [
          "reply",
          "--flow",
          flowDir(a.flow),
          "--thread",
          a.thread,
          "--text",
          a.text,
        ]),
        "reply",
      ),
  },
  {
    name: "portal_resolve",
    description:
      "Resolves (or reopens) a comment thread. CLI: scripts/portal.mjs resolve|reopen --flow <dir> --thread <id>",
    inputSchema: {
      type: "object",
      properties: { flow: str(), thread: str(), reopen: { type: "boolean" } },
      required: ["flow", "thread"],
    },
    run: async (a) =>
      fromScript(
        await run("portal.mjs", [
          a.reopen ? "reopen" : "resolve",
          "--flow",
          flowDir(a.flow),
          "--thread",
          a.thread,
        ]),
        "resolve",
      ),
  },
];

// ---- resources ----
const readPlugin = (rel) => readFileSync(join(PLUGIN_ROOT, rel), "utf8");
const IMPECCABLE_REF = join(PLUGIN_ROOT, "vendor", "impeccable", "3.5.0", "skills", "impeccable");
const RESOURCES = [
  ...["setup", "init", "flow", "review", "handoff"].map((g) => ({
    uri: `designli://guide/${g}`,
    name: `Guide: ${g}`,
    description: `The ${g} workflow, step by step (also the ${g} prompt).`,
    mimeType: "text/markdown",
    read: () => readPlugin(`guides/${g}.md`),
  })),
  ...["artboard-rules", "canvas-layout", "states-checklist"].map((r) => ({
    uri: `designli://rules/${r}`,
    name: `Rules: ${r}`,
    description: `reference/${r}.md`,
    mimeType: "text/markdown",
    read: () => readPlugin(`reference/${r}.md`),
  })),
  ...[
    ["design-flow", "design-flow.template.md"],
    ["product-md", "product-md.template.md"],
    ["greenfield", "greenfield.md"],
  ].map(([k, f]) => ({
    uri: `designli://template/${k}`,
    name: `Template: ${k}`,
    description: `reference/${f}`,
    mimeType: "text/markdown",
    read: () => readPlugin(`reference/${f}`),
  })),
  {
    uri: "designli://reference/portal-api",
    name: "Portal API essentials",
    description:
      "Offline essentials of the portal HTTP and MCP contract; the full docs live at <portal>/docs.",
    mimeType: "text/markdown",
    read: () => readPlugin("reference/portal-api.md"),
  },
  {
    uri: "designli://project/status",
    name: "Project status (live)",
    description: "The project_status tool as a resource.",
    mimeType: "application/json",
    read: async () => JSON.stringify(await TOOLS[0].run({}), null, 2),
  },
  {
    uri: "designli://project/library",
    name: "design/library.json",
    description: "The repository's design library declaration.",
    mimeType: "application/json",
    read: () => JSON.stringify(readLibrary(PROJECT), null, 2),
  },
];
try {
  for (const f of readdirSync(join(IMPECCABLE_REF, "reference")).filter((f) => f.endsWith(".md")))
    RESOURCES.push({
      uri: `designli://impeccable/${f.replace(/\.md$/, "")}`,
      name: `impeccable: ${f.replace(/\.md$/, "")}`,
      description: "Vendored impeccable 3.5.0 reference (Apache-2.0).",
      mimeType: "text/markdown",
      read: () => readFileSync(join(IMPECCABLE_REF, "reference", f), "utf8"),
    });
  RESOURCES.push({
    uri: "designli://impeccable/SKILL",
    name: "impeccable: SKILL",
    description: "Vendored impeccable 3.5.0 skill instructions.",
    mimeType: "text/markdown",
    read: () => readFileSync(join(IMPECCABLE_REF, "SKILL.md"), "utf8"),
  });
} catch {}

// ---- prompts ----
const PROMPTS = [
  {
    name: "setup",
    description:
      "Connect this repository to the Designli portal: URL, token (never in chat), project, harness config, next steps.",
    arguments: [],
  },
  {
    name: "init",
    description:
      "Design DNA from the repo (or, greenfield, from an interview): PRODUCT.md, DESIGN.md, tokens, the Components sheet.",
    arguments: [
      { name: "refresh", description: "true to re-document after code changed", required: false },
      { name: "check", description: "true to only verify the impeccable install", required: false },
    ],
  },
  {
    name: "flow",
    description: "Design a user flow with all its states and push it to the portal for review.",
    arguments: [
      { name: "brief", description: "What the user is trying to do", required: true },
      { name: "device", description: "desktop | mobile | both", required: false },
      { name: "prototype", description: "true for a clickable prototype", required: false },
      { name: "extend", description: "slug of an existing flow to extend", required: false },
    ],
  },
  {
    name: "review",
    description:
      "Pull comments and copy edits, critique, one change list, republish, reply and resolve.",
    arguments: [
      { name: "slug", description: "Flow slug", required: true },
      { name: "mode", description: "comments-only | critique-only | apply-all", required: false },
    ],
  },
  {
    name: "handoff",
    description:
      "Gate the flow and write specs/<story>/design-flow.md with flattened screen references.",
    arguments: [
      { name: "slug", description: "Flow slug", required: true },
      { name: "story", description: "User story title", required: false },
    ],
  },
];
async function promptMessages(name, args = {}) {
  const guide = readPlugin(`guides/${name}.md`);
  const status = await TOOLS[0].run({});
  const argText = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return [
    {
      role: "user",
      content: {
        type: "text",
        text: `Follow this guide for the repository at ${PROJECT}.\n\n${argText ? "Arguments:\n" + argText + "\n\n" : ""}Current project status (from project_status):\n\`\`\`json\n${JSON.stringify(status, null, 2)}\n\`\`\`\n\n---\n\n${guide}`,
      },
    },
  ];
}

// ---- protocol ----
const INSTRUCTIONS = [
  `designli-design ${PLUGIN_VERSION}: design user flows for a product repository and review them on the Designli portal.`,
  "Start with the project_status tool. If it reports a SETUP blocker or no credentials, follow the setup prompt (designli://guide/setup).",
  "Workflows are the prompts init, flow, review and handoff; each returns its guide plus the current status. Rules and templates are designli:// resources.",
  "Portal tools (portal_head, portal_pull, portal_push, edits_apply, portal_reply, portal_resolve) use the token from DESIGNLI_PORTAL_TOKEN or the user's credentials file; never ask a user to paste a token in chat.",
  "Sync rule: portal_head, portal_pull, work, portal_push; STALE_LOCAL means pull again; force only when a human asked.",
].join(" ");
const rpcError = (id, code, message, data) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});
async function handle(msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string")
    return rpcError(msg?.id, -32600, "Invalid request");
  const { id, method, params = {} } = msg;
  if (method === "initialize")
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: { name: "designli-design", version: PLUGIN_VERSION },
        instructions: INSTRUCTIONS,
      },
    };
  if (method.startsWith("notifications/")) return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list")
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      },
    };
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return rpcError(id, -32602, `Unknown tool ${params.name}`);
    try {
      const out = await tool.run(params.arguments ?? {});
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          structuredContent: out,
        },
      };
    } catch (e) {
      const err = { code: e.code ?? "INTERNAL", message: e.message, details: e.details ?? null };
      return {
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: `${err.code}: ${err.message}` }],
          structuredContent: { error: err },
        },
      };
    }
  }
  if (method === "resources/list")
    return {
      jsonrpc: "2.0",
      id,
      result: {
        resources: RESOURCES.map(({ uri, name, description, mimeType }) => ({
          uri,
          name,
          description,
          mimeType,
        })),
      },
    };
  if (method === "resources/read") {
    const r = RESOURCES.find((x) => x.uri === params.uri);
    if (!r) return rpcError(id, -32002, `Resource not found: ${params.uri}`);
    try {
      return {
        jsonrpc: "2.0",
        id,
        result: { contents: [{ uri: r.uri, mimeType: r.mimeType, text: await r.read() }] },
      };
    } catch (e) {
      return rpcError(id, -32603, e.message);
    }
  }
  if (method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: PROMPTS } };
  if (method === "prompts/get") {
    const p = PROMPTS.find((x) => x.name === params.name);
    if (!p) return rpcError(id, -32602, `Unknown prompt ${params.name}`);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        description: p.description,
        messages: await promptMessages(p.name, params.arguments ?? {}),
      },
    };
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
const write = (o) => process.stdout.write(JSON.stringify(o) + "\n");
// requests run concurrently; stdin closing ends the server only once every answer is out
let pending = 0;
let closed = false;
const maybeExit = () => closed && pending === 0 && process.exit(0);
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return write(rpcError(null, -32700, "Parse error"));
  }
  pending++;
  try {
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map(handle))).filter(Boolean);
      if (out.length) write(out);
    } else {
      const out = await handle(msg);
      if (out) write(out);
    }
  } catch (e) {
    write(rpcError(msg?.id, -32603, String(e?.message ?? e)));
  } finally {
    pending--;
    maybeExit();
  }
});
rl.on("close", () => {
  closed = true;
  maybeExit();
});
process.stderr.write(
  `designli-design MCP server ${PLUGIN_VERSION} on stdio (project ${PROJECT})\n`,
);
