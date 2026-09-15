// The designli-design MCP server over stdio, exercised against a scratch copy of the pilot flow.
//   node --test server/test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SERVER = join(ROOT, "server", "index.mjs");
const PILOT = process.env.DESIGNLI_PILOT || resolve(ROOT, "..", "design-pilot-mvp");

/** Sends every message, waits for the server to drain, returns responses by id. */
function rpc(project, messages, env = {}) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [SERVER, "--project", project], {
      env: {
        ...process.env,
        DESIGNLI_PORTAL_TOKEN: "",
        HOME: env.HOME ?? process.env.HOME,
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", rej);
    child.on("close", () => {
      const byId = {};
      for (const line of out.split("\n").filter(Boolean)) {
        const m = JSON.parse(line);
        for (const x of Array.isArray(m) ? m : [m]) byId[x.id] = x;
      }
      res(byId);
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
    child.stdin.end();
  });
}
const call = (id, name, args = {}) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "designli-"));
  // a minimal git repo so setup accepts it
  spawnSyncGit(dir);
  return dir;
}
function spawnSyncGit(dir) {
  const { execSync } = require_("node:child_process");
  execSync("git init -q", { cwd: dir });
}
function require_(m) {
  return process.getBuiltinModule ? process.getBuiltinModule(m) : import(m);
}

test("initialize, tools, resources and prompts are advertised", async () => {
  const r = await rpc(tmpdir(), [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "resources/list" },
    { jsonrpc: "2.0", id: 4, method: "prompts/list" },
    { jsonrpc: "2.0", id: 5, method: "nope/method" },
    {
      jsonrpc: "2.0",
      id: 6,
      method: "resources/read",
      params: { uri: "designli://rules/artboard-rules" },
    },
    { jsonrpc: "2.0", id: 7, method: "resources/read", params: { uri: "designli://guide/setup" } },
  ]);
  assert.equal(r[1].result.protocolVersion, "2025-03-26");
  assert.ok(r[1].result.instructions.includes("project_status"));
  assert.deepEqual(Object.keys(r[1].result.capabilities).sort(), ["prompts", "resources", "tools"]);
  const tools = r[2].result.tools.map((t) => t.name);
  for (const t of [
    "project_status",
    "credentials_status",
    "setup_write",
    "flow_check",
    "bundle",
    "portal_push",
    "portal_pull",
    "edits_apply",
  ])
    assert.ok(tools.includes(t), t);
  for (const t of r[2].result.tools)
    assert.ok(
      !JSON.stringify(t.inputSchema).includes('"token"'),
      `${t.name} must not take a token`,
    );
  const uris = r[3].result.resources.map((x) => x.uri);
  for (const u of [
    "designli://guide/flow",
    "designli://rules/artboard-rules",
    "designli://template/design-flow",
    "designli://impeccable/SKILL",
    "designli://project/status",
  ])
    assert.ok(uris.includes(u), u);
  assert.deepEqual(
    r[4].result.prompts.map((p) => p.name),
    ["setup", "init", "flow", "review", "handoff"],
  );
  assert.equal(r[5].error.code, -32601);
  assert.ok(r[6].result.contents[0].text.includes("data-component"));
  assert.ok(r[7].result.contents[0].text.includes("Never ask for the token"));
});

test("guides carry no harness-specific vocabulary", () => {
  for (const g of ["setup", "init", "flow", "review", "handoff"]) {
    const text = readFileSync(join(ROOT, "guides", `${g}.md`), "utf8");
    for (const bad of [
      "AskUserQuestion",
      "Skill tool",
      "Artifact tool",
      "CLAUDE_PLUGIN_ROOT",
      "seed-canvas",
      "seed-flow",
      "claude-canvas",
    ])
      assert.ok(!text.includes(bad), `${g}.md mentions ${bad}`);
  }
});

test(
  "project_status and flow_check on the pilot repo",
  { skip: !existsSync(join(PILOT, "design", "flows")) && "pilot repo not found" },
  async () => {
    const r = await rpc(PILOT, [
      call(1, "project_status"),
      call(2, "flow_check", { flow: "create-and-send-an-invoice" }),
      {
        jsonrpc: "2.0",
        id: 3,
        method: "prompts/get",
        params: { name: "flow", arguments: { brief: "cancel a subscription" } },
      },
    ]);
    const s = r[1].result.structuredContent;
    assert.equal(s.ok, true);
    assert.ok(s.flows.some((f) => f.slug === "create-and-send-an-invoice"));
    assert.equal(s.info.greenfield, true);
    const c = r[2].result.structuredContent;
    assert.equal(r[2].result.isError, undefined, JSON.stringify(c).slice(0, 300));
    assert.equal(c.ok, true);
    const text = r[3].result.messages[0].content.text;
    assert.ok(text.includes("cancel a subscription"));
    assert.ok(text.includes("# flow:"));
    assert.ok(text.includes('"flows"'));
  },
);

test("portal tools without credentials fail with a clear code, never a crash", async () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const r = await rpc(
    PILOT,
    [
      call(1, "credentials_status", { url: "https://portal.example.test" }),
      call(2, "portal_projects"),
    ],
    { HOME: home, DESIGNLI_PORTAL_URL: "https://portal.example.test" },
  );
  assert.equal(r[1].result.structuredContent.ok, false);
  assert.equal(r[1].result.structuredContent.tokenSource, null);
  assert.ok(r[1].result.structuredContent.howTo.includes("setup.mjs"));
  assert.equal(r[2].result.isError, true);
  assert.equal(r[2].result.structuredContent.error.code, "PORTAL_TOKEN");
});

test("setup_write connects a fresh repo and points at init for a new product", async () => {
  const dir = scratchRepo();
  const r = await rpc(dir, [
    call(1, "setup_write", { url: "http://example.com", projectId: "acme", harness: "claude" }),
    call(2, "setup_write", {
      url: "https://portal.example.test",
      projectId: "acme",
      harness: "claude",
    }),
    call(3, "project_status"),
  ]);
  assert.equal(r[1].result.isError, true, "plain http must be refused");
  assert.equal(r[1].result.structuredContent.error.code, "VALIDATION");
  const w = r[2].result.structuredContent;
  assert.equal(w.ok, true);
  const lib = JSON.parse(readFileSync(join(dir, "design", "library.json"), "utf8"));
  assert.deepEqual(lib.publish, {
    target: "portal",
    portal: { url: "https://portal.example.test", projectId: "acme" },
  });
  assert.equal(lib.harness, "claude");
  const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  assert.equal(
    mcp.mcpServers["designli-portal"].headers.Authorization,
    "Bearer ${DESIGNLI_PORTAL_TOKEN}",
  );
  assert.equal(
    mcp.mcpServers["designli-design"],
    undefined,
    "the Claude Code plugin registers the local server itself",
  );
  assert.ok(readFileSync(join(dir, ".gitignore"), "utf8").includes("design/**/bundle/"));
  assert.ok(w.nextSteps[0].includes("init"), w.nextSteps[0]);
  assert.ok(w.nextSteps[0].includes("New product"), w.nextSteps[0]);
  const s = r[3].result.structuredContent;
  assert.equal(s.harness, "claude");
  assert.ok(!s.warnings.some((x) => x.code === "SETUP"));
});

test("setup_write refuses to write a literal token into .mcp.json", async () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(
    join(dir, ".mcp.json"),
    JSON.stringify({
      mcpServers: { other: { headers: { Authorization: "Bearer dpat_abcdefghijklmnop" } } },
    }),
  );
  const r = await rpc(dir, [
    call(1, "setup_write", {
      url: "https://portal.example.test",
      projectId: "acme",
      harness: "claude",
    }),
    call(2, "project_status"),
  ]);
  assert.equal(r[1].result.isError, true);
  assert.ok(r[1].result.structuredContent.error.message.includes("literal token"));
  assert.ok(r[2].result.structuredContent.warnings.some((x) => x.code === "TOKEN_IN_REPO"));
});
