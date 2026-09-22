// Drives the plugin's MCP server the way a client does: one stdio process per repository,
// JSON-RPC 2.0, one request at a time. Tokens come from the environment or the credentials
// file the server reads itself; nothing here handles them.
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

export const PLUGIN_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SERVER = join(PLUGIN_ROOT, "server", "index.mjs");

export class McpClient {
  constructor(project, { env = {} } = {}) {
    this.project = project;
    this.child = spawn(process.execPath, [SERVER, "--project", project], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.buf = "";
    this.waiters = new Map();
    this.seq = 0;
    this.stderr = "";
    this.child.stdout.on("data", (d) => {
      this.buf += d;
      const lines = this.buf.split("\n");
      this.buf = lines.pop();
      for (const line of lines.filter(Boolean)) {
        let m;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        const w = this.waiters.get(m.id);
        if (w) {
          this.waiters.delete(m.id);
          w(m);
        }
      }
    });
    this.child.stderr.on("data", (d) => (this.stderr += d));
  }
  request(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res) => {
      this.waiters.set(id, res);
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  /** Calls a tool; returns { ok, out, error, ms, raw }. Errors never throw: the runner records them. */
  async call(name, args = {}) {
    const t0 = Date.now();
    const m = await this.request("tools/call", { name, arguments: args });
    const ms = Date.now() - t0;
    const r = m.result;
    if (!r) return { ok: false, error: { code: "RPC", message: m.error?.message || "no result" }, ms, raw: m };
    if (r.isError) return { ok: false, error: r.structuredContent?.error ?? { code: "TOOL", message: r.content?.[0]?.text }, ms, raw: m };
    return { ok: true, out: r.structuredContent, ms, raw: m };
  }
  async tools() {
    const m = await this.request("tools/list");
    return m.result.tools;
  }
  close() {
    this.child.stdin.end();
    return new Promise((res) => this.child.on("close", res));
  }
}
