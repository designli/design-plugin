// The run log: redaction, per-run tagging, tail, and the diagnose tool over the server.
//   node --test "server/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const ROOT = join(import.meta.dirname, "..", "..");

test("log lines carry the run id, never a token, and tail filters by run", async () => {
  process.env.DESIGNLI_LOG_DIR = mkdtempSync(join(tmpdir(), "dlog-"));
  const { log, setRun, tail, redact } = await import("../lib/log.mjs");
  const a = setRun();
  log("http", { path: "/me", header: "Bearer dpat_abcdefghijklmnop", status: 401 });
  const b = setRun();
  log("tool.error", { tool: "publish", message: "token dpat_zzzzzzzzzzzz refused" });
  const files = readdirSync(process.env.DESIGNLI_LOG_DIR);
  assert.equal(files.length, 1);
  const raw = readFileSync(join(process.env.DESIGNLI_LOG_DIR, files[0]), "utf8");
  assert.ok(
    !raw.includes("dpat_abcdefghijklmnop") && !raw.includes("dpat_zzzz"),
    "redacted on disk",
  );
  assert.ok(raw.includes(`"run":"${a}"`) && raw.includes(`"run":"${b}"`));
  assert.deepEqual(tail(10, { run: b }).lines.length, 1);
  assert.equal(tail(10).lines.length, 2);
  assert.equal(redact("Authorization: Bearer abc.def"), "Authorization: Bearer …");
});

test("a failed tool call answers with its run id and diagnose returns that run's lines", async () => {
  const logDir = mkdtempSync(join(tmpdir(), "dlog-"));
  const child = spawn(
    process.execPath,
    [join(ROOT, "server", "index.mjs"), "--project", tmpdir()],
    {
      env: {
        ...process.env,
        DESIGNLI_LOG_DIR: logDir,
        DESIGNLI_PORTAL_TOKEN: "",
        HOME: mkdtempSync(join(tmpdir(), "h-")),
        DESIGNLI_PORTAL_URL: "https://portal.example.test",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  const done = new Promise((r) => child.on("close", r));
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "publish", arguments: { note: "x" } },
    }) + "\n",
  );
  child.stdin.end();
  await done;
  const r1 = JSON.parse(out.split("\n").filter(Boolean)[0]);
  assert.equal(r1.result.isError, true);
  const run = r1.result.structuredContent.error.run;
  assert.match(run, /^run_[0-9a-f]{8}$/);
  const lines = readFileSync(join(logDir, readdirSync(logDir)[0]), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.deepEqual(
    lines.map((l) => l.event),
    ["tool", "tool.error"],
  );
  assert.ok(lines.every((l) => l.run === run));
  assert.equal(lines[1].code, "PORTAL_TOKEN");
});
