#!/usr/bin/env node
// Simulates a client round on the portal, repeatably: comments (one sent to the agent), copy
// edits (one inside an include), a waiver and a journey reorder. Reads two tokens from files so
// nothing secret is on the command line:
//   node client-round.mjs --url http://localhost:8787 --project lab --client <file> --staff <file> [--round N]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const url = (opt("--url") || "http://localhost:8787").replace(/\/$/, "");
const project = opt("--project", "lab");
const round = Number(opt("--round", "1"));
const tok = (f) => readFileSync(f, "utf8").trim();
const client = tok(opt("--client"));
const staff = tok(opt("--staff"));

async function call(token, method, path, body, raw = false) {
  const r = await fetch(url + (raw ? "" : "/api/v1") + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
  return raw ? text : JSON.parse(text);
}
const normalize = (s) => s.replace(/\s+/g, " ").trim();
function textHash(s) {
  const t = normalize(s);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return "t" + (h >>> 0).toString(16);
}
/** First short visible text in a tag that copy edits usually target. */
const pickText = (html) => {
  const m = html.match(/<(h1|h2|h3|button|label|a|p)\b[^>]*>([^<]{3,60})<\/\1>/i);
  return m ? normalize(m[2]) : null;
};

const out = { round, threads: [], edits: [], waiver: null, reorder: null };
const flows = (await call(client, "GET", `/projects/${project}/flows`)).flows.filter(
  (f) => f.latestVersion > 0,
);
if (!flows.length) throw new Error("no published flow on the portal; publish first");
const flow = flows[0];
const v = await call(client, "GET", `/projects/${project}/flows/${flow.id}/versions/latest`);
const screens = v.manifest.screens.filter((s) => s.kind === "state");
const A = screens[0];
const B = screens[Math.min(1, screens.length - 1)];
const htmlA = await call(
  client,
  "GET",
  `/p/${project}/${flow.id}/v${v.number}/${A.devices.desktop.file}?raw=1`,
  undefined,
  true,
);
const includeBlock = (htmlA.match(
  /<div data-imported-component="[^"]+">[\s\S]*?<!-- end [^>]+ -->/,
) || [""])[0];
const outsideIncludes = htmlA.replace(/<!-- begin [^>]+ -->[\s\S]*?<!-- end [^>]+ -->/g, "");

// comments
const post = async (text, screen, anchor) => {
  const t = await call(client, "POST", `/projects/${project}/flows/${flow.id}/comments`, {
    text: `${text} (round ${round})`,
    screen,
    anchor,
    flowVersion: v.number,
  });
  out.threads.push({ id: t.id, screen: screen?.id ?? null, text });
  return t;
};
await post(
  "Overall this flows well, but I get lost after paying: where do I find the code again?",
  null,
);
await post(
  "The primary button is too far from the total; can they sit together?",
  { id: A.id, device: "desktop" },
  { x: 70, y: 80 },
);
await post(
  "This error message blames me. Say what to do instead.",
  { id: B.id, device: "desktop" },
  { x: 50, y: 40 },
);
const forAgent = await post(
  "Please make the station names links to a map. Sending this to the agent.",
  { id: A.id, device: "desktop" },
  { x: 30, y: 30 },
);
await call(staff, "PATCH", `/projects/${project}/flows/${flow.id}/comments/${forAgent.id}`, {
  sentToAgent: true,
});
out.threads[out.threads.length - 1].sentToAgent = true;

// copy edits: one in the screen, one in an include
const edit = async (originalText, newText, tag) => {
  const e = await call(client, "POST", `/projects/${project}/flows/${flow.id}/text-edits`, {
    screen: { id: A.id, device: "desktop" },
    elementPath: "b/0",
    originalText,
    originalHash: textHash(originalText),
    newText,
    flowVersion: v.number,
  });
  out.edits.push({ id: e.id, tag, originalText, newText });
};
const screenText = pickText(outsideIncludes);
if (screenText)
  await edit(
    screenText,
    screenText.endsWith("!") ? screenText.slice(0, -1) : screenText + " today",
    "screen",
  );
const includeText = includeBlock ? pickText(includeBlock) : null;
if (includeText)
  await edit(
    includeText,
    includeText.toUpperCase() === includeText ? includeText.toLowerCase() : includeText + " ↗",
    "include",
  );
else out.edits.push({ tag: "include", skipped: "screen A has no include with a short text" });

// structure: waive the first missing state, reorder the journey
const grid = await call(staff, "GET", `/projects/${project}/flows/${flow.id}/states`);
if (grid.missing?.length) {
  const m = grid.missing[0];
  await call(staff, "POST", `/projects/${project}/flows/${flow.id}/waivers`, {
    step: m.step,
    state: m.state,
    reason: `client decision, round ${round}: this state does not occur in the pilot`,
  });
  out.waiver = m;
}
const all = (await call(staff, "GET", `/projects/${project}/flows`)).flows.map((f) => f.id);
if (all.length > 1) {
  const ids = [...all].reverse();
  await call(staff, "PUT", `/projects/${project}/flows/order`, { ids });
  out.reorder = ids;
}
console.log(JSON.stringify(out, null, 2));
