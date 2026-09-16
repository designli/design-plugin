// Run log: one JSON line per event in ~/.config/designli-design/logs/<date>.log (7 days kept),
// mirrored to stderr when DESIGNLI_DEBUG=1. Tokens never reach it: values are redacted on write.
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { CRED_DIR } from "./setup.mjs";

export const LOG_DIR = process.env.DESIGNLI_LOG_DIR || join(CRED_DIR, "logs");
const DEBUG = /^(1|true|yes)$/i.test(process.env.DESIGNLI_DEBUG || "");
const KEEP_DAYS = 7;
let current = null;
export const newRunId = () => "run_" + randomBytes(4).toString("hex");
/** The run every event is tagged with; a tool call or a CLI invocation sets its own. */
export function setRun(id = newRunId()) {
  current = id;
  return id;
}
export const runId = () => current || setRun();
export const redact = (s) =>
  String(s)
    .replace(/dpat_[A-Za-z0-9_-]{4,}/g, "dpat_…")
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1…");
const day = () => new Date().toISOString().slice(0, 10);
let swept = false;
function sweep() {
  if (swept) return;
  swept = true;
  try {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
    for (const f of readdirSync(LOG_DIR))
      if (/^\d{4}-\d{2}-\d{2}\.log$/.test(f) && f.slice(0, 10) < cutoff)
        unlinkSync(join(LOG_DIR, f));
  } catch {}
}
/** log("http", { method, path, status, ms }) */
export function log(event, fields = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), run: runId(), event, ...fields });
  const safe = redact(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    sweep();
    appendFileSync(join(LOG_DIR, `${day()}.log`), safe + "\n", { mode: 0o600 });
  } catch {}
  if (DEBUG) process.stderr.write(safe + "\n");
}
/** The last `n` lines across the day files, newest last, redacted again on the way out. */
export function tail(n = 200, { run } = {}) {
  if (!existsSync(LOG_DIR)) return { dir: LOG_DIR, lines: [] };
  const files = readdirSync(LOG_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f))
    .sort();
  const lines = [];
  for (const f of files.reverse()) {
    const all = readFileSync(join(LOG_DIR, f), "utf8").split("\n").filter(Boolean);
    lines.unshift(...(run ? all.filter((l) => l.includes(`"run":"${run}"`)) : all));
    if (lines.length >= n) break;
  }
  return { dir: LOG_DIR, lines: lines.slice(-n).map(redact) };
}
