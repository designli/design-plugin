// A small portal HTTP client for the suite: bearer token from a file (0600) or the process
// environment, never from argv; JSON in and out; every call records status and time. Tokens
// never appear in observations: callers pass a `Token` object whose value is not enumerable.
import { readFileSync } from "node:fs";

export class Token {
  constructor(value, label) {
    Object.defineProperty(this, "value", { value, enumerable: false });
    this.label = label;
  }
  static fromFile(path, label) {
    return new Token(readFileSync(path, "utf8").trim(), label);
  }
  toJSON() {
    return { label: this.label };
  }
}
export class Api {
  constructor(url) {
    this.url = url.replace(/\/$/, "");
    this.log = []; // { method, path, status, ms }
  }
  async req(token, method, path, body, { raw = false, headers = {} } = {}) {
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(this.url + (raw ? "" : "/api/v1") + path, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token.value}` } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          "x-designli-client": "designli-suite/1",
          ...headers,
        },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      });
    } catch (e) {
      this.log.push({ method, path, status: 0, ms: Date.now() - t0 });
      return { status: 0, json: null, text: "", error: e.message, ok: false, headers: new Headers() };
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    this.log.push({ method, path, status: res.status, ms: Date.now() - t0 });
    return { status: res.status, json, text, ok: res.ok, headers: res.headers, error: res.ok ? null : json?.error?.message || text.slice(0, 200), code: json?.error?.code ?? null };
  }
  get(token, path, o) {
    return this.req(token, "GET", path, undefined, o);
  }
  post(token, path, body, o) {
    return this.req(token, "POST", path, body ?? {}, o);
  }
  patch(token, path, body, o) {
    return this.req(token, "PATCH", path, body, o);
  }
  put(token, path, body, o) {
    return this.req(token, "PUT", path, body, o);
  }
  del(token, path, o) {
    return this.req(token, "DELETE", path, undefined, o);
  }
  /** A cookie session from a token (API-only exchange), for the calls a PAT may not make. */
  async session(token) {
    const res = await fetch(this.url + "/api/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token.value }),
    });
    const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
    if (!res.ok || !cookie) throw new Error(`session exchange failed: ${res.status}`);
    return new Token(cookie, `${token.label} (session)`);
  }
  /** Calls with a cookie session instead of a bearer. */
  async withSession(session, method, path, body) {
    return this.req(null, method, path, body, { headers: { cookie: session.value } });
  }
  /** Mints a scoped token through a session; returns a Token. */
  async mint(session, scope) {
    const r = await this.withSession(session, "POST", "/account/tokens", scope);
    if (r.status !== 201) throw new Error(`mint ${scope.label}: ${r.status} ${r.error}`);
    return new Token(r.json.token, scope.label);
  }
  stats() {
    const by = {};
    for (const l of this.log) {
      const k = String(l.status);
      by[k] = (by[k] || 0) + 1;
    }
    return { calls: this.log.length, byStatus: by, ms: this.log.reduce((n, l) => n + l.ms, 0) };
  }
}
/**
 * A tiny JSON-RPC 2.0 client for the MCP *streamable HTTP* transport (POST <url>/mcp), for tests
 * that must hit the dev-agent / client MCP endpoints over HTTP rather than spawning the stdio
 * server (see lib/rpc.mjs's McpClient for that). Sends `initialize` once, lazily, then one
 * `tools/call` per `call()`. Never throws on HTTP or tool errors — everything comes back on the
 * result. Tokens keep Token's never-enumerable-value semantics; only `token.value` is read, and
 * only to build the Authorization header.
 */
export class McpHttp {
  constructor(url, token) {
    this.url = url.replace(/\/$/, "") + "/mcp";
    this.token = token;
    this.initialized = false;
    this.nextId = 1;
  }
  async #send(body) {
    let res;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token.value}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return { status: 0, ok: false, json: null };
    }
    const status = res.status;
    const ok = res.ok;
    const ctype = res.headers.get("content-type") || "";
    const text = await res.text();
    let json = null;
    if (ctype.includes("text/event-stream")) {
      // SSE body: one or more "data: <json-rpc message>" lines; take the one answering our id,
      // else the last parseable message.
      for (const line of text.split("\n")) {
        const m = line.match(/^data:\s*(.*)$/);
        if (!m) continue;
        try {
          const parsed = JSON.parse(m[1]);
          if (parsed && typeof parsed === "object" && "jsonrpc" in parsed) {
            json = parsed;
            if (parsed.id === body.id) break;
          }
        } catch {}
      }
    } else {
      try {
        json = JSON.parse(text);
      } catch {}
    }
    return { status, ok, json };
  }
  async #ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true; // once, regardless of outcome: a refused initialize still lets the real call below carry its own error
    await this.#send({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "designli-suite", version: "1" } },
    });
  }
  /** Calls one MCP tool; returns { status, ok, result, error, isError } and never throws. */
  async call(name, args) {
    await this.#ensureInitialized();
    const r = await this.#send({ jsonrpc: "2.0", id: this.nextId++, method: "tools/call", params: { name, arguments: args } });
    if (!r.json) return { status: r.status, ok: false, result: null, error: { message: "no JSON-RPC response" }, isError: null };
    const rpcError = r.json.error ?? null;
    const result = r.json.result ?? null;
    const isError = result && typeof result === "object" ? (result.isError ?? null) : null;
    return { status: r.status, ok: r.ok && !rpcError && !isError, result, error: rpcError, isError };
  }
}
export const textHash = (s) => {
  const t = String(s).replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return "t" + (h >>> 0).toString(16);
};
