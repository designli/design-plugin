#!/usr/bin/env node
// Generates the Marquee corpus (event ticketing, ten flows) into a repository, plus the answer
// key the scorer compares against. Deterministic: no timestamps, no randomness, so two runs give
// identical files and hashes.
//   node gen.mjs --out <dir> [--stress]      (--stress adds the two limit-check flows)
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// ---- the product ----
export const PRODUCT = {
  name: "Marquee",
  summary:
    "Tickets for live events: fans find a show, pick seats and pay in a minute; organizers publish events and get paid out weekly.",
  audience: "Fans buying tickets on their phone; organizers on a laptop.",
};
const EVENTS = [
  ["Sofía Ríos live at Teatro Colsubsidio", "Fri 17 Oct · 20:00", "COP 180.000"],
  ["Medellín Jazz Night", "Sat 25 Oct · 19:30", "COP 95.000"],
  ["Comic Fest 2026", "Sun 2 Nov · 10:00", "COP 60.000"],
  ["Los Petit Fellas · Acoustic", "Thu 6 Nov · 21:00", "COP 140.000"],
  ["Stand-up: Alejandro Riaño", "Fri 14 Nov · 20:30", "COP 110.000"],
  ["Andrés Cepeda · Sinfónico", "Sat 22 Nov · 20:00", "COP 250.000"],
];

// ---- flows: the answer key is derived from this table ----
// kind decides the required states; extra states are planted on purpose; `missing` removes a required one
export const FLOWS = [
  {
    slug: "sign-up",
    title: "Sign up",
    goal: "A fan creates an account with an email and a name.",
    devices: ["desktop", "mobile"],
    steps: [
      { id: "Email", kind: "form" },
      { id: "Details", kind: "form", extra: ["Custom-Locked"] },
      { id: "Welcome", kind: "result" },
    ],
  },
  {
    slug: "find-an-event",
    title: "Find an event",
    goal: "A fan searches, browses results and opens an event.",
    devices: ["desktop", "mobile"],
    steps: [
      { id: "Search", kind: "form" },
      { id: "Results", kind: "data" },
      { id: "Event", kind: "info", deepLink: { flow: "buy-tickets", file: "01-tickets-default.html", label: "Buy tickets" } },
      { id: "Dates", kind: "choice" },
    ],
  },
  {
    slug: "buy-tickets",
    title: "Buy tickets",
    goal: "A fan picks tickets and seats, pays and receives the order.",
    devices: ["desktop", "mobile"],
    main: true,
    longTitles: true,
    steps: [
      { id: "Tickets", kind: "choice" },
      { id: "Seats", kind: "choice" },
      { id: "Payment", kind: "form", extra: ["Custom-Declined"] },
      { id: "Review", kind: "confirmation" },
      { id: "Done", kind: "result" },
    ],
  },
  {
    slug: "transfer-a-ticket",
    title: "Transfer a ticket",
    goal: "A fan sends a ticket to a friend by email.",
    devices: ["mobile"],
    steps: [
      { id: "Recipient", kind: "form" },
      { id: "Confirm", kind: "confirmation" },
      { id: "Sent", kind: "result" },
    ],
  },
  {
    slug: "request-a-refund",
    title: "Request a refund",
    goal: "A fan asks for a refund on a cancelled event.",
    devices: ["desktop"],
    steps: [
      { id: "Order", kind: "data" },
      { id: "Reason", kind: "form", missing: ["Error"] },
      { id: "Result", kind: "result" },
    ],
  },
  {
    slug: "check-in-scan",
    title: "Check-in scan",
    goal: "Door staff scan a ticket and see whether it is valid.",
    devices: ["desktop", "mobile"],
    oddNames: true,
    steps: [
      { id: "Scan", kind: "choice" },
      { id: "Próximo Evento", kind: "info", weird: true },
    ],
  },
  {
    slug: "create-an-event",
    title: "Create an event",
    goal: "An organizer publishes an event with schedule, venue, tickets and media.",
    devices: ["desktop"],
    sidebar: true,
    steps: [
      { id: "Basics", kind: "form" },
      { id: "Schedule", kind: "form" },
      { id: "Venue", kind: "choice", extra: ["Selected"] },
      { id: "Tickets", kind: "form" },
      { id: "Media", kind: "form", big: true },
      { id: "Publish", kind: "confirmation" },
    ],
  },
  {
    slug: "payouts",
    title: "Payouts",
    goal: "An organizer sees what is owed, adds a bank account and reads the payout history.",
    devices: ["desktop"],
    sidebar: true,
    steps: [
      { id: "Overview", kind: "data" },
      { id: "Bank", kind: "form" },
      { id: "Schedule", kind: "choice" },
      { id: "History", kind: "data", deepLink: { flow: "create-an-event", file: "01-basics-default.html", label: "Create another event" } },
    ],
  },
  {
    slug: "account-settings",
    title: "Account settings",
    goal: "A user edits their profile and security settings.",
    devices: ["desktop", "mobile"],
    steps: [
      { id: "Profile", kind: "form" },
      { id: "Security", kind: "form", brokenLink: "04-nope-default.html", brokenInclude: "Nope" },
      { id: "Danger", kind: "confirmation" },
    ],
  },
  {
    slug: "notifications",
    title: "Notifications",
    goal: "A user chooses what Marquee tells them about and where.",
    devices: ["desktop"],
    steps: [
      { id: "Details", kind: "form" },
      { id: "Channels", kind: "choice" },
    ],
  },
];
export const REQUIRED = {
  form: ["Default", "Validation", "Submitting", "Error"],
  data: ["Default", "Loading", "Empty", "Error"],
  choice: ["Default", "Loading", "Error"],
  confirmation: ["Default", "Submitting", "Error", "Success"],
  result: ["Default", "Success"],
  info: ["Default"],
};
const nn = (i) => String(i + 1).padStart(2, "0");
const lc = (s) => s.toLowerCase().replace(/[^a-z0-9]+/gi, "-");
const stepId = (id) => id.replace(/[^A-Za-z0-9]/g, "");
const statesOf = (st) => [...REQUIRED[st.kind].filter((s) => !(st.missing || []).includes(s)), ...(st.extra || [])];
const fileOf = (n, st, state, device, odd) => {
  const base = odd && st.weird ? `${n}-${st.id}-${state}` : odd ? `${n}-${st.id}-${state.toLowerCase()}` : `${n}-${lc(st.id)}-${lc(state)}`;
  return `${base}${device === "mobile" ? "-m" : ""}.html`;
};

// ---- components ----
const STYLES = `<style>
:root{--ink:#17130f;--bg:#faf7f2;--accent:#b8321f;--muted:#6b625a;--line:#e3dcd2;--ok:#1d6b45;--font:"Inter",system-ui,sans-serif}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 var(--font)}
a{color:var(--accent)} main{max-width:960px;margin:0 auto;padding:32px 24px}
h1{font-size:2rem;margin:0 0 .5rem;letter-spacing:-.01em} h2{font-size:1.25rem}
.mq-header{display:flex;align-items:center;gap:24px;padding:16px 24px;border-bottom:1px solid var(--line);background:#fff}
.mq-header nav a{margin-left:16px;text-decoration:none;color:var(--ink)}
.mq-footer{padding:24px;border-top:1px solid var(--line);color:var(--muted);font-size:.875rem}
.mq-logo{font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.btn{display:inline-block;padding:10px 18px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
.btn.secondary{background:#fff;color:var(--accent)} .btn[aria-disabled="true"]{opacity:.5}
.field{display:grid;gap:6px;margin:12px 0} .field input,.field select,.field textarea{padding:10px;border:1px solid var(--line);border-radius:6px;font:inherit}
.error{color:#a12d1c;font-size:.875rem} .alert{padding:12px 16px;border-radius:6px;background:#fbe9e5;color:#7a2317}
.ok{padding:12px 16px;border-radius:6px;background:#e4f3ea;color:var(--ok)} .card{padding:16px;border:1px solid var(--line);border-radius:8px;background:#fff;margin:8px 0}
.skeleton{height:14px;background:#eee8df;border-radius:4px;margin:8px 0} table{border-collapse:collapse;width:100%} td,th{padding:8px;border-bottom:1px solid var(--line);text-align:left}
.sidebar{float:left;width:200px;margin-right:24px} .sidebar a{display:block;padding:8px 0;color:var(--ink);text-decoration:none}
body.mobile main{padding:16px} body.mobile .sidebar{display:none}
</style>
`;
const COMPONENTS = {
  "Styles.html": STYLES,
  "Logo.html": `<span class="mq-logo">Marquee</span>\n`,
  "Header.html": `<header class="mq-header" data-component="Header">\n  <dc-import name="Logo"></dc-import>\n  <nav><a href="#">My tickets</a><a href="#">Help centre</a><a href="#">Sign in</a></nav>\n</header>\n`,
  "Footer.html": `<footer class="mq-footer" data-component="Footer">Marquee · Tickets for live events · <a href="#">Terms</a> · <a href="#">Privacy</a> · Prices in COP, service fee included</footer>\n`,
  "Sidebar.html": `<aside class="sidebar" data-component="Sidebar"><a href="#">Events</a><a href="#">Orders</a><a href="#">Payouts</a><a href="#">Settings</a></aside>\n`,
  "Buttons.html": `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Buttons</title><dc-import name="Styles"></dc-import></head>\n<body><main><h1>Buttons</h1><p><a class="btn" href="#">Primary</a> <a class="btn secondary" href="#">Secondary</a> <a class="btn" aria-disabled="true" href="#">Disabled</a></p></main></body></html>\n`,
};

// ---- screens ----
const bigSvg = () => {
  // ~1.5 MB of inline SVG: a repeated path, the kind of thing a poster export produces
  const path = '<path d="M12 2 L22 22 L2 22 Z" fill="#b8321f" opacity=".2"/>';
  return `<svg viewBox="0 0 24 24" width="480" height="480" aria-hidden="true">${path.repeat(24000)}</svg>`;
};
function body(flow, st, state, n, i, device) {
  const ev = EVENTS[i % EVENTS.length];
  const next = flow.steps[i + 1];
  const nextHref = next ? fileOf(nn(i + 1), next, "Default", device, flow.oddNames) : null;
  const title = flow.longTitles
    ? `${st.id}: ${ev[0]} — a very long screen title to see how the portal wraps names on boards and in the journey map (${state})`
    : `${st.id} · ${state}`;
  const primary = (label) =>
    nextHref
      ? i === 1 && flow.slug === "buy-tickets"
        ? `<button class="btn" data-goto="${nextHref}" data-on="${label}">${label}</button>`
        : `<a class="btn" href="${nextHref}">${label}</a>`
      : `<a class="btn" href="#">${label}</a>`;
  const deep = st.deepLink
    ? `<p><a class="btn secondary" href="../${st.deepLink.flow}/${st.deepLink.file}">${st.deepLink.label}</a></p>`
    : "";
  const broken = st.brokenLink ? `<p><a href="${st.brokenLink}">Manage sessions</a></p>` : "";
  const brokenInc = st.brokenInclude ? `<dc-import name="${st.brokenInclude}"></dc-import>` : "";
  let content = "";
  switch (st.kind) {
    case "form": {
      const invalid = state === "Validation";
      content = `<form>
  <div class="field"><label for="f1">${st.id === "Payment" ? "Card number" : st.id === "Email" ? "Email address" : "Name"}</label><input id="f1" type="text" value="${st.id === "Payment" ? "4242 4242 4242 4242" : st.id === "Email" ? "ana@ejemplo.co" : "Ana Restrepo"}">${invalid ? '<span class="error">Enter a valid value to continue</span>' : ""}</div>
  <div class="field"><label for="f2">${st.id === "Payment" ? "Expiry" : "Phone"}</label><input id="f2" type="text" value="${st.id === "Payment" ? "12/28" : "+57 300 123 4567"}"></div>
  ${state === "Submitting" ? '<a class="btn" aria-disabled="true" href="#">Saving…</a>' : primary(st.id === "Payment" ? "Pay COP 180.000" : "Continue")}
</form>
${state === "Error" ? '<p class="alert" role="alert">We could not save this. Check your connection and try again.</p>' : ""}
${state === "Custom-Locked" ? '<p class="alert" role="alert">Too many attempts. Try again in 15 minutes or reset your password.</p>' : ""}
${state === "Custom-Declined" ? '<p class="alert" role="alert">Your card was declined. Try another card or contact your bank.</p>' : ""}
${st.big && state === "Default" ? bigSvg() : ""}`;
      break;
    }
    case "choice":
      content = `<fieldset>
  <legend>Pick one</legend>
  ${EVENTS.slice(0, 3).map((e, k) => `<label class="card"><input type="radio" name="opt" ${k === 0 && state === "Selected" ? "checked" : ""}> ${e[0]} <small>${e[1]} · ${e[2]}</small></label>`).join("\n  ")}
</fieldset>
${state === "Loading" ? '<div class="skeleton"></div><div class="skeleton"></div>' : ""}
${state === "Error" ? '<p class="alert" role="alert">The options did not load. Refresh to try again.</p>' : ""}
<p>${primary("Continue")}</p>`;
      break;
    case "data":
      content =
        state === "Loading"
          ? '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>'
          : state === "Empty"
            ? `<p class="card">Nothing here yet. ${st.id === "Results" ? "Try another search." : "Your first payout arrives after your first sale."}</p>`
            : state === "Error"
              ? '<p class="alert" role="alert">We could not load this list. Try again in a moment.</p>'
              : `<table><thead><tr><th>Event</th><th>When</th><th>Amount</th></tr></thead><tbody>
${EVENTS.map((e) => `<tr><td>${e[0]}</td><td>${e[1]}</td><td>${e[2]}</td></tr>`).join("\n")}
</tbody></table>`;
      content += `\n<p>${primary("Continue")}</p>${deep}`;
      break;
    case "confirmation":
      content = `<p class="card">Order 3 × ${ev[0]} · Total <strong>COP 540.000</strong></p>
${state === "Submitting" ? '<a class="btn" aria-disabled="true" href="#">Placing order…</a>' : state === "Success" ? '<p class="ok">Done. Your tickets are in My tickets.</p>' : primary("Confirm and pay")}
${state === "Error" ? '<p class="alert" role="alert">Payment failed. Nothing was charged; try again.</p>' : ""}`;
      break;
    case "result":
      content = `<p class="ok">${state === "Success" ? "Success. Check your email for the tickets." : "You are all set."}</p><p>${primary("Back to events")}</p>`;
      break;
    default:
      content = `<p>${ev[0]} · ${ev[1]} · ${ev[2]}</p><p>Doors open one hour before. Bring an ID that matches the ticket holder.</p>${deep}<p>${primary("Continue")}</p>`;
  }
  return { title, html: `${brokenInc}\n<h1>${title}</h1>\n${content}\n${broken}` };
}
function page(flow, st, state, n, i, device) {
  const { title, html } = body(flow, st, state, n, i, device);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<dc-import name="Styles"></dc-import>
</head>
<body class="${device === "mobile" ? "mobile" : "desktop"}">
<dc-import name="Header"></dc-import>
<main>
${flow.sidebar ? '<dc-import name="Sidebar"></dc-import>' : ""}
${html}
</main>
<dc-import name="Footer"></dc-import>
</body>
</html>
`;
}
const MAIN = (flow) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${flow.title} map</title><dc-import name="Styles"></dc-import></head>
<body><main><h1>${flow.title}: the map</h1><ol>${flow.steps.map((s, i) => `<li>${nn(i)} ${s.id}</li>`).join("")}</ol><p>Comment with the screen name first, e.g. <code>02-Seats-Default: …</code></p></main></body></html>
`;

// ---- generate ----
export function generate(out, { stress = false } = {}) {
  const dir = resolve(out);
  const design = join(dir, "design");
  rmSync(join(design, "flows"), { recursive: true, force: true });
  mkdirSync(join(design, "components"), { recursive: true });
  for (const [f, c] of Object.entries(COMPONENTS)) writeFileSync(join(design, "components", f), c);
  writeFileSync(
    join(design, "prototype.json"),
    JSON.stringify(
      {
        schema: 1,
        source: "static",
        dir: "design",
        components: "design/components",
        devices: { desktop: { w: 1440, h: 900 }, mobile: { w: 390, h: 844 } },
        product: PRODUCT,
      },
      null,
      2,
    ) + "\n",
  );
  const key = { product: PRODUCT, flows: [], components: {}, edits: {}, stress: null };
  const flows = stress ? [...FLOWS, ...STRESS] : FLOWS;
  for (const flow of flows) {
    const fdir = join(design, "flows", flow.slug);
    mkdirSync(fdir, { recursive: true });
    const k = { slug: flow.slug, title: flow.title, devices: flow.devices, steps: [], entry: null, transitions: [], crossFlow: [], gaps: [], files: 0 };
    flow.steps.forEach((st, i) => {
      const n = nn(i);
      const states = statesOf(st);
      const ks = { n, id: st.weird ? st.id : stepId(st.id), kind: st.kind, states, missing: st.missing || [], custom: (st.extra || []).filter((s) => s.startsWith("Custom-")), weird: !!st.weird };
      k.steps.push(ks);
      for (const state of states)
        for (const device of flow.devices) {
          const f = fileOf(n, st, state, device, flow.oddNames);
          writeFileSync(join(fdir, f), page(flow, st, state, n, i, device));
          k.files++;
        }
      const next = flow.steps[i + 1];
      if (next) {
        const from = `${n}-${stepId(st.id)}-Default`;
        const to = `${nn(i + 1)}-${stepId(next.id)}-Default`;
        const label = st.kind === "form" ? (st.id === "Payment" ? "Pay COP 180.000" : "Continue") : st.kind === "confirmation" ? "Confirm and pay" : st.kind === "result" ? "Back to events" : "Continue";
        k.transitions.push({ from, on: label, to });
      }
      if (st.deepLink) k.crossFlow.push({ from: `${n}-${stepId(st.id)}`, to: st.deepLink.flow, label: st.deepLink.label });
      for (const m of st.missing || []) k.gaps.push({ kind: "state-missing", where: `${n} ${m}` });
      if (st.brokenLink) k.gaps.push({ kind: "broken-link", where: `${n} ${st.brokenLink}` });
      if (st.brokenInclude) k.gaps.push({ kind: "broken-include", where: `${n} ${st.brokenInclude}` });
    });
    k.entry = `01-${stepId(flow.steps[0].id)}`;
    if (flow.main) writeFileSync(join(fdir, "Main.html"), MAIN(flow));
    key.flows.push(k);
  }
  key.components = {
    files: Object.keys(COMPONENTS).map((f) => f.replace(".html", "")),
    nested: { Header: ["Logo"] },
    unused: ["Buttons"],
    stylesInHead: true,
  };
  // copy-edit targets the client round uses: an include text (Header), a screen text that appears
  // in every state file of a step, and a text only on the mobile-only flow
  key.edits = {
    include: { text: "Help centre", component: "Header", screensUsing: key.flows.reduce((n, f) => n + f.files, 0) },
    screen: { flow: "sign-up", step: "01", text: "Email address", filesTouched: 4 * 2, note: "every state of the step, both devices" },
    mobileOnly: { flow: "transfer-a-ticket", text: "Confirm and pay", filesTouched: 2, note: "Default and Error states carry the button, mobile only; the applied text is HTML-escaped" },
  };
  if (stress)
    key.stress = {
      files: { slug: "stress-files", files: 450, expect: "refused: more than 400 files", code: "VALIDATION" },
      bytes: { slug: "stress-bytes", expect: "refused: over 20 MB", code: "BUNDLE_TOO_LARGE" },
    };
  writeFileSync(join(dir, "BRIEF.md"), brief(flows));
  writeFileSync(join(dir, "answer-key.json"), JSON.stringify(key, null, 2) + "\n");
  if (!existsSync(join(dir, ".gitignore")))
    writeFileSync(join(dir, ".gitignore"), "design/**/bundle/\ndesign/**/.seed/\ndesign/**/.review/\n.mcp.local.json\n.DS_Store\n");
  return key;
}
// limit checks: refused by the portal, must fail cleanly
const STRESS = [
  {
    slug: "stress-files",
    title: "Stress: too many files",
    goal: "A flow with 450 files; the portal accepts at most 400.",
    devices: ["desktop", "mobile"],
    steps: Array.from({ length: 45 }, (_, i) => ({ id: `Step${i + 1}`, kind: "form", extra: ["Selected"] })),
  },
  {
    slug: "stress-bytes",
    title: "Stress: too many bytes",
    goal: "A single 21 MB screen; the portal accepts at most 20 MB.",
    devices: ["desktop"],
    steps: [{ id: "Huge", kind: "info", huge: true }],
  },
];
// the huge screen is written after the fact so page() stays simple
const origGenerate = generate;
export function generateAll(out, opts) {
  const key = origGenerate(out, opts);
  if (opts?.stress) {
    const f = join(resolve(out), "design", "flows", "stress-bytes", "01-huge-default.html");
    writeFileSync(f, `<!doctype html><html><head><meta charset="utf-8"><title>Huge</title></head><body><h1>Huge</h1><pre>${"x".repeat(21 * 1024 * 1024)}</pre></body></html>\n`);
  }
  return key;
}
function brief(flows) {
  return `# Brief: ${PRODUCT.name}, tickets for live events

${PRODUCT.summary} ${PRODUCT.audience}

Tone: direct, warm, no marketing gloss. Money is explicit (COP, service fee included). Every screen has one primary action.

## Flows

${flows.map((f, i) => `${i + 1}. **${f.title}** (${f.devices.join(" + ")}): ${f.goal} Steps: ${f.steps.map((s) => s.id).join(" → ")}.`).join("\n")}

## What the prototype must show

- Every step in every state its kind requires; realistic data; real error copy.
- A shared header, footer and (for organizers) a sidebar as includes; shared CSS in \`design/components/Styles.html\`.
- Links between screens for every primary action; a few links across flows.
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const out = a[a.indexOf("--out") + 1];
  if (!out || a.indexOf("--out") < 0) {
    console.error("usage: node gen.mjs --out <dir> [--stress]");
    process.exit(2);
  }
  const key = generateAll(out, { stress: a.includes("--stress") });
  console.log(`${key.flows.length} flows, ${key.flows.reduce((n, f) => n + f.files, 0)} screen files, ${key.components.files.length} components → ${resolve(out)}`);
}
