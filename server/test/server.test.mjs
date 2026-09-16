// The designli-design MCP server over stdio, exercised against the pilot repo and scratch repos.
//   node --test "server/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SERVER = join(ROOT, "server", "index.mjs");
const PILOT = process.env.DESIGNLI_PILOT || resolve(ROOT, "..", "design-pilot-mvp");
const GUIDES = [
  "setup",
  "prototype",
  "adopt",
  "publish",
  "feedback",
  "handoff",
  "status",
  "review",
];

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
function scratchRepo({ remote = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "designli-"));
  execSync("git init -q", { cwd: dir });
  if (remote) execSync("git remote add origin git@example.com:acme/proto.git", { cwd: dir });
  return dir;
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
      params: { uri: "designli://rules/prototype" },
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
    "prototype_scan",
    "flows_propose",
    "flows_write",
    "gaps",
    "bundle",
    "publish",
    "feedback_pull",
    "feedback_digest",
    "edits_apply",
    "adopt_from_portal",
    "handoff",
    "portal_reply",
    "portal_resolve",
  ])
    assert.ok(tools.includes(t), t);
  for (const gone of [
    "flow_check",
    "tokens_css",
    "portal_components_push",
    "portal_push",
    "portal_head",
  ])
    assert.ok(!tools.includes(gone), `${gone} was removed`);
  for (const t of r[2].result.tools)
    assert.ok(
      !JSON.stringify(t.inputSchema).includes('"token"'),
      `${t.name} must not take a token`,
    );
  const uris = r[3].result.resources.map((x) => x.uri);
  for (const u of [
    ...GUIDES.map((g) => `designli://guide/${g}`),
    "designli://rules/prototype",
    "designli://rules/states",
    "designli://template/product-md",
    "designli://impeccable/SKILL",
    "designli://project/status",
    "designli://project/gaps",
  ])
    assert.ok(uris.includes(u), u);
  assert.deepEqual(
    r[4].result.prompts.map((p) => p.name),
    GUIDES,
  );
  assert.equal(r[5].error.code, -32601);
  assert.ok(r[6].result.contents[0].text.includes("dc-import"));
  assert.ok(r[7].result.contents[0].text.includes("Never ask for the token"));
});

test("guides carry no harness-specific vocabulary", () => {
  for (const g of GUIDES) {
    const text = readFileSync(join(ROOT, "guides", `${g}.md`), "utf8");
    for (const bad of [
      "AskUserQuestion",
      "Skill tool",
      "Artifact tool",
      "CLAUDE_PLUGIN_ROOT",
      "seed-canvas",
      "seed-flow",
      "claude-canvas",
      "flow-check",
      "dc-to-html",
    ])
      assert.ok(!text.includes(bad), `${g}.md mentions ${bad}`);
  }
  for (const s of GUIDES) assert.ok(existsSync(join(ROOT, "skills", s, "SKILL.md")), `skill ${s}`);
});

test(
  "project_status, gaps and the adopt prompt on the pilot repo",
  { skip: !existsSync(join(PILOT, "design", "flows")) && "pilot repo not found" },
  async () => {
    const r = await rpc(PILOT, [
      call(1, "project_status", { portal: false }),
      call(2, "gaps"),
      call(3, "flows_propose"),
      { jsonrpc: "2.0", id: 4, method: "prompts/get", params: { name: "adopt", arguments: {} } },
    ]);
    const s = r[1].result.structuredContent;
    assert.ok(
      s.info.flows.some((f) => f.slug === "create-and-send-an-invoice" && f.screens === 22),
    );
    assert.equal(s.info.gaps.total, 0);
    assert.equal(s.info.product.name, "Kite");
    assert.deepEqual(r[2].result.structuredContent.gaps, []);
    assert.deepEqual(
      r[3].result.structuredContent.flows,
      [],
      "an adopted prototype proposes nothing new",
    );
    assert.deepEqual(r[3].result.structuredContent.unassigned, []);
    const text = r[4].result.messages[0].content.text;
    assert.ok(text.includes("# adopt:"));
    assert.ok(text.includes('"flows"'));
  },
);

test("portal tools without credentials fail with a clear code, never a crash", async () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const dir = scratchRepo({ remote: true });
  const r = await rpc(
    dir,
    [
      call(1, "credentials_status", { url: "https://portal.example.test" }),
      call(2, "portal_projects"),
      call(3, "publish", { note: "x" }),
      call(4, "feedback_pull"),
      call(5, "edits_dismiss", { flow: "x", id: "ted_1", reason: "no" }),
    ],
    { HOME: home, DESIGNLI_PORTAL_URL: "https://portal.example.test" },
  );
  assert.equal(r[1].result.structuredContent.ok, false);
  assert.equal(r[1].result.structuredContent.tokenSource, null);
  assert.ok(r[1].result.structuredContent.howTo.includes("setup.mjs"));
  for (const id of [2, 3, 4, 5]) {
    assert.equal(r[id].result.isError, true);
    assert.equal(
      r[id].result.structuredContent.error.code,
      "PORTAL_TOKEN",
      JSON.stringify(r[id].result.structuredContent),
    );
  }
});

test("setup_write needs a git remote, connects the repo and points at adopt", async () => {
  const noRemote = scratchRepo();
  const r0 = await rpc(noRemote, [
    call(1, "setup_write", {
      url: "https://portal.example.test",
      projectId: "acme",
      harness: "claude",
    }),
  ]);
  assert.equal(r0[1].result.isError, true);
  assert.equal(r0[1].result.structuredContent.error.code, "GIT_REMOTE");
  const dir = scratchRepo({ remote: true });
  const r = await rpc(dir, [
    call(1, "setup_write", { url: "http://example.com", projectId: "acme", harness: "claude" }),
    call(2, "setup_write", {
      url: "https://portal.example.test",
      projectId: "acme",
      harness: "claude",
    }),
    call(3, "project_status", { portal: false }),
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
  assert.ok(
    w.nextSteps.some((s) => s.includes("adopt")),
    w.nextSteps.join("\n"),
  );
  const s = r[3].result.structuredContent;
  assert.equal(s.harness, "claude");
  assert.ok(!s.warnings.some((x) => x.code === "SETUP"));
});

test("setup_write refuses to write a literal token into .mcp.json", async () => {
  const dir = scratchRepo({ remote: true });
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
    call(2, "project_status", { portal: false }),
  ]);
  assert.equal(r[1].result.isError, true);
  assert.ok(r[1].result.structuredContent.error.message.includes("literal token"));
  assert.ok(r[2].result.structuredContent.warnings.some((x) => x.code === "TOKEN_IN_REPO"));
});

test("adopt over the server: scan, propose, write, gaps, bundle on a plain HTML prototype", async () => {
  const dir = scratchRepo({ remote: true });
  mkdirSync(join(dir, "design", "components"), { recursive: true });
  mkdirSync(join(dir, "design", "flows", "checkout"), { recursive: true });
  writeFileSync(join(dir, "design", "components", "Nav.html"), "<nav>Shop</nav>");
  const doc = (t, b) =>
    `<!doctype html><html><head><title>${t}</title></head><body><dc-import name="Nav"></dc-import>${b}</body></html>`;
  writeFileSync(
    join(dir, "design", "flows", "checkout", "cart.html"),
    doc("Your cart", `<table><tr><td>Item</td></tr></table><a href="pay.html">Checkout</a>`),
  );
  writeFileSync(
    join(dir, "design", "flows", "checkout", "cart-empty.html"),
    doc("Your cart", `<p>Nothing here yet</p>`),
  );
  writeFileSync(
    join(dir, "design", "flows", "checkout", "pay.html"),
    doc("Pay", `<form><input></form>`),
  );
  const r = await rpc(dir, [call(1, "prototype_scan"), call(2, "flows_propose")]);
  const prop = r[2].result.structuredContent;
  assert.equal(prop.flows.length, 1);
  const flow = prop.flows[0];
  assert.deepEqual(
    flow.steps.map((s) => s.id + ":" + s.kind),
    ["Cart:data", "Pay:form"],
  );
  assert.deepEqual(flow.steps[0].states, { Default: "cart.html", Empty: "cart-empty.html" });
  flow.entryPoints = [{ from: "Nav: Cart", to: "01-Cart" }];
  const r2 = await rpc(dir, [
    call(1, "flows_write", { flows: [flow], prototype: { product: { name: "Shop" } } }),
    call(2, "gaps"),
    call(3, "bundle", { flow: "checkout" }),
    call(4, "project_status", { portal: false }),
  ]);
  assert.equal(r2[1].result.isError, undefined, JSON.stringify(r2[1].result.structuredContent));
  const gaps = r2[2].result.structuredContent.gaps.map((g) => g.kind + ":" + g.where).sort();
  assert.deepEqual(gaps, [
    "state-missing:01 Error",
    "state-missing:01 Loading",
    "state-missing:02 Error",
    "state-missing:02 Submitting",
    "state-missing:02 Validation",
  ]);
  const b = r2[3].result.structuredContent;
  assert.equal(b.ok, true);
  assert.equal(b.screens, 3);
  assert.deepEqual(
    b.manifest.screens.map((s) => s.id),
    ["01-Cart-Default", "01-Cart-Empty", "02-Pay-Default"],
  );
  const s = r2[4].result.structuredContent;
  assert.equal(s.info.flows[0].neverPublished, true);
  assert.ok(
    s.nextSteps.some((x) => x.includes("publish")),
    s.nextSteps.join("\n"),
  );
});
