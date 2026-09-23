#!/usr/bin/env node
// Generates the Marquee corpus (event ticketing, ten flows) into a repository, plus the answer
// key the scorer compares against. Deterministic: no timestamps, no randomness, so two runs give
// identical files and hashes.
//   node gen.mjs --out <dir> [--stress]      (--stress adds the two limit-check flows)
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
// the key names steps and states the way the plugin derives them from file names, so a
// mismatch in the scorer is a real one, not a spelling difference ("TopUp" vs "Topup")
import { guessStem } from "../../server/lib/flows.mjs";

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
      {
        id: "Event",
        kind: "info",
        deepLink: { flow: "buy-tickets", file: "01-tickets-default.html", label: "Buy tickets" },
      },
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
      {
        id: "History",
        kind: "data",
        deepLink: {
          flow: "create-an-event",
          file: "01-basics-default.html",
          label: "Create another event",
        },
      },
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
const statesOf = (st) => [
  ...REQUIRED[st.kind].filter((s) => !(st.missing || []).includes(s)),
  ...(st.extra || []),
];
const fileOf = (n, st, state, device, odd) => {
  const base =
    odd && st.weird
      ? `${n}-${st.id}-${state}`
      : odd
        ? `${n}-${st.id}-${state.toLowerCase()}`
        : `${n}-${lc(st.id)}-${lc(state)}`;
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
// an inline SVG sized to roughly `mb` megabytes (xl profile's `sizeMB`); same repeated-path trick as
// bigSvg, just scaled. 3 MB sits under MAX_SOURCE_BYTES (4 MB); 5 MB sits over it on purpose.
const bigSvgOfSize = (mb) => {
  const path = '<path d="M12 2 L22 22 L2 22 Z" fill="#b8321f" opacity=".2"/>';
  const n = Math.round((mb * 1024 * 1024) / path.length);
  return `<svg viewBox="0 0 24 24" width="480" height="480" aria-hidden="true">${path.repeat(n)}</svg>`;
};
// deterministic rows for a `rows: N` data step (ticket-types, reports): no randomness, stable across runs.
// The first row is real copy ("General admission") so the xl profile has a table-edit target to find.
const TICKET_TIERS = ["General admission", "VIP", "Early bird"];
const tableRows = (st) => {
  if (!st.rows) return EVENTS;
  return Array.from({ length: st.rows }, (_, r) => [
    TICKET_TIERS[r] || `Tier ${r + 1}`,
    `Row ${r + 1}`,
    `COP ${((r + 1) * 15000).toLocaleString("es-CO")}`,
  ]);
};
function body(flow, st, state, n, i, device) {
  // two states rendered as one file (xl profile's `identicalDefaultSuccess`): fold Default into
  // Success before anything below reads `state`, so both states produce identical bytes.
  if (st.identicalDefaultSuccess && (state === "Default" || state === "Success")) state = "Success";
  // a shared Loading skeleton (xl profile's `sharedLoading`): fixed markup, no flow-specific text,
  // so every flow that opts in writes byte-identical Loading files (per device) — planted dedupe.
  if (flow.sharedLoading && state === "Loading")
    return {
      title: "Loading",
      html: '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>',
    };
  const ev = EVENTS[i % EVENTS.length];
  const next = flow.steps[i + 1];
  const nextHref = next ? fileOf(nn(i + 1), next, "Default", device, flow.oddNames) : null;
  const title = flow.longTitles
    ? `${st.id}: ${ev[0]} — a very long screen title to see how the portal wraps names on boards and in the journey map (${state})`
    : `${st.id} · ${state}${st.emojiTitle ? " 🎟️" : ""}`;
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
${st.big && state === "Default" ? bigSvg() : ""}${st.sizeMB && state === "Default" ? bigSvgOfSize(st.sizeMB) : ""}`;
      break;
    }
    case "choice":
      content = `<fieldset>
  <legend>Pick one</legend>
  ${EVENTS.slice(0, 3)
    .map(
      (e, k) =>
        `<label class="card"><input type="radio" name="opt" ${k === 0 && state === "Selected" ? "checked" : ""}> ${e[0]} <small>${e[1]} · ${e[2]}</small></label>`,
    )
    .join("\n  ")}
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
${tableRows(st)
  .map((e) => `<tr><td>${e[0]}</td><td>${e[1]}</td><td>${e[2]}</td></tr>`)
  .join("\n")}
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
  // xl profile: a step's extra `links` into other flows, plus the automatic help-centre link every
  // flow's last step carries on its Default screen (help-centre itself excluded). Both render as
  // secondary buttons; empty when neither applies, so the default profile is untouched.
  // identicalDefaultSuccess already folded Default into Success above, so check for either: both
  // calls must agree, or the two states stop being byte-identical.
  const isLastDefault =
    i === flow.steps.length - 1 &&
    (state === "Default" || (st.identicalDefaultSuccess && state === "Success"));
  const crossLinks = [
    ...(st.links || []).map(
      (l) => `<a class="btn secondary" href="../${l.flow}/${l.file}">${l.label}</a>`,
    ),
    ...(flow.xl && isLastDefault && flow.slug !== "help-centre"
      ? ['<a class="btn secondary" href="../help-centre/01-home-default.html">Help centre</a>']
      : []),
  ].join(" ");
  // buy-tickets' first step deliberately repeats "Help centre" (once via the Header include, once
  // here) so the xl round-A "twoIncludes" edit target has two real occurrences to find on one screen.
  const helpHint =
    st.helpHint && state === "Default"
      ? '<p class="muted">Need help? Visit the <a href="../help-centre/01-home-default.html">Help centre</a>.</p>'
      : "";
  const extra = [crossLinks ? `<p>${crossLinks}</p>` : "", helpHint].filter(Boolean).join("\n");
  const extraBlock = extra ? `\n${extra}` : "";
  return { title, html: `${brokenInc}\n<h1>${title}</h1>\n${content}${extraBlock}\n${broken}` };
}
function page(flow, st, state, n, i, device) {
  const { title, html } = body(flow, st, state, n, i, device);
  // sharedLoading's Loading screen is generic on purpose (see body()): no Stepper, no EventCard,
  // so it stays byte-identical across every flow that opts in regardless of their own chrome.
  const isSharedLoadingState = flow.sharedLoading && state === "Loading";
  const chrome = [
    flow.sidebar ? '<dc-import name="Sidebar"></dc-import>' : "",
    flow.showsEventCard && !isSharedLoadingState ? '<dc-import name="EventCard"></dc-import>' : "",
    flow.showsStepper && !isSharedLoadingState ? '<dc-import name="Stepper"></dc-import>' : "",
  ]
    .filter(Boolean)
    .join("\n");
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
${chrome}
${html}
</main>
<dc-import name="Footer"></dc-import>
</body>
</html>
`;
}
const MAIN = (
  flow,
) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${flow.title} map</title><dc-import name="Styles"></dc-import></head>
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
    const k = {
      slug: flow.slug,
      title: flow.title,
      devices: flow.devices,
      main: !!flow.main,
      steps: [],
      entry: null,
      transitions: [],
      crossFlow: [],
      gaps: [],
      files: 0,
    };
    flow.steps.forEach((st, i) => {
      const n = nn(i);
      const states = statesOf(st);
      const ks = {
        n,
        id: st.weird ? st.id : stepId(st.id),
        kind: st.kind,
        states,
        missing: st.missing || [],
        custom: (st.extra || []).filter((s) => s.startsWith("Custom-")),
        weird: !!st.weird,
      };
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
        const label =
          st.kind === "form"
            ? st.id === "Payment"
              ? "Pay COP 180.000"
              : "Continue"
            : st.kind === "confirmation"
              ? "Confirm and pay"
              : st.kind === "result"
                ? "Back to events"
                : "Continue";
        k.transitions.push({ from, on: label, to });
      }
      if (st.deepLink)
        k.crossFlow.push({
          from: `${n}-${stepId(st.id)}`,
          to: st.deepLink.flow,
          label: st.deepLink.label,
        });
      for (const m of st.missing || []) k.gaps.push({ kind: "state-missing", where: `${n} ${m}` });
      if (st.brokenLink) k.gaps.push({ kind: "broken-link", where: `${n} ${st.brokenLink}` });
      if (st.brokenInclude)
        k.gaps.push({ kind: "broken-include", where: `${n} ${st.brokenInclude}` });
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
    include: {
      text: "Help centre",
      component: "Header",
      screensUsing: key.flows.reduce((n, f) => n + f.files, 0),
    },
    screen: {
      flow: "sign-up",
      step: "01",
      text: "Email address",
      filesTouched: 4 * 2,
      note: "every state of the step, both devices",
    },
    mobileOnly: {
      flow: "transfer-a-ticket",
      text: "Confirm and pay",
      filesTouched: 2,
      note: "Default and Error states carry the button, mobile only; the applied text is HTML-escaped",
    },
  };
  if (stress)
    key.stress = {
      files: {
        slug: "stress-files",
        files: 450,
        expect: "refused: more than 400 files",
        code: "VALIDATION",
      },
      bytes: { slug: "stress-bytes", expect: "refused: over 20 MB", code: "BUNDLE_TOO_LARGE" },
    };
  writeFileSync(join(dir, "BRIEF.md"), brief(flows));
  writeFileSync(join(dir, "answer-key.json"), JSON.stringify(key, null, 2) + "\n");
  if (!existsSync(join(dir, ".gitignore")))
    writeFileSync(
      join(dir, ".gitignore"),
      "design/**/bundle/\ndesign/**/.seed/\ndesign/**/.review/\n.mcp.local.json\n.DS_Store\n",
    );
  return key;
}
// ---- the xl profile: twenty [xl-contract.md counts 21, see note below] flows, a bigger design
// system, and an answer key rich enough for the round-trip (comments, edits, releases) the runner
// drives against it. Same page()/body() machinery as the small profile; nothing here changes a byte
// of what the small profile writes.
const STYLES_XL = STYLES.replace(
  "</style>\n",
  `.stepper{display:flex;gap:16px;list-style:none;padding:0;margin:0 0 16px}
.stepper li{padding:4px 12px;border-radius:999px;background:#eee8df;color:var(--muted);font-size:.8125rem}
.event-card{padding:16px;border:1px solid var(--line);border-radius:8px;background:#fff;margin:0 0 16px}
</style>
`,
);
const COMPONENTS_XL = {
  ...COMPONENTS,
  "Styles.html": STYLES_XL,
  "Stepper.html": `<ol class="stepper"><li>Choose</li><li>Pay</li><li>Done</li></ol>\n`,
  "EventCard.html": `<div class="event-card" data-component="EventCard"><p>From COP 60.000</p><p>Doors open one hour before.</p></div>\n`,
  "Inputs.html": `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Inputs</title><dc-import name="Styles"></dc-import></head>\n<body><main><h1>Inputs</h1><div class="field"><label for="i1">Text</label><input id="i1" type="text" value="Ana Restrepo"></div><div class="field"><label for="i2">Choice</label><select id="i2"><option>General admission</option><option>VIP</option></select></div></main></body></html>\n`,
  "Legacy.html": `<div class="legacy">Old promo banner</div>\n`,
};
// team's goal, built to land at exactly 500 characters (longGoal): deterministic, no hand-counting.
const TEAM_GOAL = (() => {
  const base =
    "An organizer invites teammates, assigns roles and controls who can publish events, issue refunds, edit payouts and read reports across every event the organizer runs. ";
  const filler = "Roles keep the account safe without a shared password. ";
  let s = base;
  while (s.length < 500) s += filler;
  return s.slice(0, 500);
})();
export const FLOWS_XL = [
  // ---- fan ----
  {
    slug: "sign-up",
    title: "Sign up",
    goal: "A fan creates an account with an email and a name.",
    devices: ["desktop", "mobile"],
    xl: true,
    showsStepper: true,
    steps: [
      { id: "Email", kind: "form" },
      { id: "Details", kind: "form", extra: ["Custom-Locked"] },
      { id: "Welcome", kind: "result" },
    ],
  },
  {
    slug: "sign-in",
    title: "Sign in",
    goal: "A returning fan signs in with an email and a one-time code.",
    devices: ["desktop", "mobile"],
    xl: true,
    steps: [
      { id: "Email", kind: "form" },
      { id: "Code", kind: "form" },
    ],
  },
  {
    slug: "find-an-event",
    title: "Find an event",
    goal: "A fan searches, browses results and opens an event.",
    devices: ["desktop", "mobile"],
    xl: true,
    sharedLoading: true,
    showsStepper: true,
    showsEventCard: true,
    steps: [
      { id: "Search", kind: "form" },
      { id: "Results", kind: "data" },
      {
        id: "Event",
        kind: "info",
        links: [
          { flow: "buy-tickets", file: "01-tickets-default.html", label: "Buy tickets" },
          { flow: "event-details", file: "01-overview-default.html", label: "Details" },
        ],
      },
      { id: "Dates", kind: "choice" },
    ],
  },
  {
    slug: "event-details",
    title: "Event details",
    goal: "A fan reads the full details of an event before buying.",
    devices: ["desktop", "mobile"],
    xl: true,
    showsEventCard: true,
    steps: [
      { id: "Overview", kind: "info" },
      {
        id: "Venue",
        kind: "info",
        links: [{ flow: "seat-map", file: "01-map-default.html", label: "Pick seats" }],
      },
    ],
  },
  {
    slug: "buy-tickets",
    title: "Buy tickets",
    goal: "A fan picks tickets and seats, pays and receives the order.",
    devices: ["desktop", "mobile"],
    xl: true,
    main: true,
    longTitles: true,
    showsStepper: true,
    showsEventCard: true,
    steps: [
      { id: "Tickets", kind: "choice", helpHint: true },
      { id: "Seats", kind: "choice" },
      {
        id: "Payment",
        kind: "form",
        extra: [
          "Custom-Declined",
          "Custom-3DSecure",
          "Loading",
          "Empty",
          "Success",
          "Disabled",
          "Selected",
          "Partial",
          "Stale",
        ],
      },
      { id: "Review", kind: "confirmation" },
      {
        id: "Done",
        kind: "result",
        links: [{ flow: "my-tickets", file: "01-list-default.html", label: "See my tickets" }],
      },
    ],
  },
  {
    slug: "seat-map",
    title: "Seat map",
    goal: "A fan picks a section, row and seat before paying.",
    devices: ["desktop", "mobile"],
    xl: true,
    showsStepper: true,
    steps: [
      { id: "Map", kind: "choice" },
      { id: "Row", kind: "choice" }, // removed in release 2 (rounds.release2.removedStep)
      {
        id: "Seat",
        kind: "choice",
        links: [
          { flow: "buy-tickets", file: "01-tickets-default.html", label: "Continue to payment" },
        ],
      },
    ],
  },
  {
    slug: "my-tickets",
    title: "My tickets",
    goal: "A fan sees the tickets on their account and what to do with them.",
    devices: ["desktop", "mobile"],
    xl: true,
    sharedLoading: true,
    showsEventCard: true,
    steps: [
      { id: "List", kind: "data" },
      {
        id: "Ticket",
        kind: "info",
        links: [
          { flow: "transfer-a-ticket", file: "01-recipient-default-m.html", label: "Transfer" },
          { flow: "request-a-refund", file: "01-order-default.html", label: "Refund" },
        ],
      },
    ],
  },
  {
    slug: "transfer-a-ticket",
    title: "Transfer a ticket",
    goal: "A fan sends a ticket to a friend by email.",
    devices: ["mobile"],
    xl: true,
    showsStepper: true,
    steps: [
      { id: "Recipient", kind: "form" },
      { id: "Confirm", kind: "confirmation" },
      {
        id: "Sent",
        kind: "result",
        links: [{ flow: "my-tickets", file: "01-list-default.html", label: "Back to my tickets" }],
      }, // the loop
    ],
  },
  {
    slug: "request-a-refund",
    title: "Request a refund",
    goal: "A fan asks for a refund on a cancelled event.",
    devices: ["desktop"],
    xl: true,
    showsStepper: true,
    steps: [
      { id: "Order", kind: "data" },
      { id: "Reason", kind: "form", missing: ["Error"] },
      { id: "Result", kind: "result" },
    ],
  },
  {
    slug: "wallet",
    title: "Wallet",
    goal: "A fan tops up and spends balance without re-entering a card.",
    devices: ["desktop", "mobile"],
    xl: true,
    mobileFirst: true,
    sharedLoading: true,
    showsStepper: true,
    steps: [
      { id: "Balance", kind: "data" },
      { id: "TopUp", kind: "form" },
      { id: "History", kind: "data" }, // "Cards" step (form) added in release 2 (rounds.release2.addedStep)
    ],
  },
  {
    slug: "notifications",
    title: "Notifications",
    goal: "A user chooses what Marquee tells them about and where.",
    devices: ["desktop", "mobile"],
    xl: true,
    steps: [
      { id: "Details", kind: "form", mobileOnlyStates: ["Error"] },
      { id: "Channels", kind: "choice" },
    ],
  },
  {
    slug: "account-settings",
    title: "Account settings",
    goal: "A user edits their profile and security settings.",
    devices: ["desktop", "mobile"],
    xl: true,
    showsStepper: true,
    steps: [
      { id: "Profile", kind: "form", emojiTitle: true },
      { id: "Security", kind: "form", brokenLink: "04-nope-default.html", brokenInclude: "Nope" },
      { id: "Danger", kind: "confirmation" },
    ],
  },
  // ---- organizer ----
  {
    slug: "create-an-event",
    title: "Create an event",
    goal: "An organizer publishes an event with schedule, venue, tickets and media.",
    devices: ["desktop"],
    xl: true,
    sidebar: true,
    main: true,
    steps: [
      { id: "Basics", kind: "form" },
      { id: "Schedule", kind: "form" },
      { id: "Venue", kind: "choice", extra: ["Selected"] },
      { id: "Tickets", kind: "form" },
      { id: "Media", kind: "form", sizeMB: 3 },
      { id: "Publish", kind: "confirmation" },
    ],
  },
  {
    slug: "schedule",
    title: "Schedule",
    goal: "An organizer sets the dates and times an event runs.",
    devices: ["desktop"],
    xl: true,
    sidebar: true,
    steps: [
      { id: "Dates", kind: "form" },
      { id: "Times", kind: "form" },
      { id: "Review", kind: "confirmation" },
    ],
  },
  {
    slug: "ticket-types",
    title: "Ticket types",
    goal: "An organizer defines the ticket tiers and prices for an event.",
    devices: ["desktop"],
    xl: true,
    sidebar: true,
    steps: [
      { id: "List", kind: "data", rows: 60 },
      { id: "New", kind: "form" },
      { id: "Pricing", kind: "form" },
      {
        id: "Review",
        kind: "confirmation",
        links: [{ flow: "promo-codes", file: "01-list-default.html", label: "Add a promo code" }],
      },
    ],
  },
  {
    slug: "promo-codes",
    title: "Promo codes",
    goal: "An organizer creates discount codes for an event.",
    devices: ["desktop"],
    xl: true,
    sidebar: true,
    steps: [
      { id: "List", kind: "data" },
      { id: "New", kind: "form" },
      { id: "Done", kind: "result" },
    ], // deleted locally in release 2 (rounds.release2.deletedFlow)
  },
  {
    slug: "payouts",
    title: "Payouts",
    goal: "An organizer sees what is owed, adds a bank account and reads the payout history.",
    devices: ["desktop"],
    xl: true,
    sidebar: true,
    steps: [
      { id: "Overview", kind: "data" },
      { id: "Bank", kind: "form" },
      { id: "Schedule", kind: "choice" },
      {
        id: "History",
        kind: "data",
        links: [
          {
            flow: "create-an-event",
            file: "01-basics-default.html",
            label: "Create another event",
          },
        ],
      },
    ],
  },
  {
    slug: "reports",
    title: "Reports",
    goal: "An organizer exports sales and payout reports.",
    devices: ["desktop"],
    xl: true,
    sidebar: true,
    steps: [
      { id: "Sales", kind: "data", rows: 60 },
      { id: "Export", kind: "form", sizeMB: 5 },
      { id: "Done", kind: "result", identicalDefaultSuccess: true },
    ],
  },
  {
    slug: "team",
    title: "Team",
    goal: TEAM_GOAL,
    devices: ["desktop"],
    xl: true,
    sidebar: true,
    longGoal: true,
    steps: [
      { id: "Members", kind: "data" },
      { id: "Invite", kind: "form" },
      { id: "Roles", kind: "choice" },
    ], // renamed to organizer-team in release 2 (rounds.release2.renamedFlow)
  },
  // ---- door ----
  {
    slug: "check-in-scan",
    title: "Check-in scan",
    goal: "Door staff scan a ticket and see whether it is valid.",
    devices: ["desktop", "mobile"],
    xl: true,
    oddNames: true,
    main: true,
    steps: [
      { id: "Scan", kind: "choice" },
      { id: "Próximo Evento", kind: "info", weird: true },
    ],
  },
  // ---- cross-cutting ----
  {
    slug: "help-centre",
    title: "Help centre",
    goal: "A user finds an answer without contacting support.",
    devices: ["desktop", "mobile"],
    xl: true,
    steps: [{ id: "Home", kind: "info" }],
  },
];
/** Which devices get a file for one (step, state): mobileOnlyStates and mobileFirst narrow it down. */
function devicesForXl(flow, st, state) {
  if ((st.mobileOnlyStates || []).includes(state))
    return flow.devices.filter((d) => d === "mobile");
  if (flow.mobileFirst)
    return state === "Default" ? flow.devices : flow.devices.filter((d) => d === "mobile");
  return flow.devices;
}
const pushDedup = (list, flow, on) => {
  if (!list.some((x) => x.flow === flow && x.on === on)) list.push({ flow, on });
};
/**
 * rounds: copied from the contract (owner: "me"/run.mjs reads it as-is), except every number this
 * generator can compute from the corpus it just wrote — filesTouched, screensUsing — is computed by
 * reading the written files back, not hard-coded.
 */
function buildRoundsXl(design, key) {
  const stepFiles = (slug, n) => {
    const dir = join(design, "flows", slug);
    return existsSync(dir)
      ? readdirSync(dir).filter(
          (f) => f.startsWith(`${n}-`) && f.endsWith(".html") && f !== "Main.html",
        )
      : [];
  };
  const containing = (slug, n, text) =>
    stepFiles(slug, n).filter((f) =>
      readFileSync(join(design, "flows", slug, f), "utf8").includes(text),
    ).length;
  const eventCardUsedBy = key.components.usedBy.EventCard || [];
  return {
    A: {
      comments: 25,
      edits: 8,
      waivers: 3,
      stepTitles: 2,
      entryPoints: 1,
      agentThreads: 2,
      reopened: 1,
      editTargets: [
        {
          name: "screen",
          flow: "sign-up",
          screen: "01-Email-Default",
          text: "Email address",
          newText: "Your email",
          filesTouched: stepFiles("sign-up", "01").length,
        },
        {
          name: "include",
          flow: "sign-up",
          screen: "01-Email-Default",
          text: "Help centre",
          newText: "Help center",
          component: "Header",
          filesTouched: 1,
        },
        {
          name: "nested",
          flow: "sign-up",
          screen: "01-Email-Default",
          text: "Marquee",
          newText: "MARQUEE",
          component: "Logo",
          filesTouched: 1,
        },
        {
          name: "shared",
          flow: "find-an-event",
          screen: "03-Event-Default",
          text: "Doors open one hour before.",
          newText: "Doors open 60 minutes before.",
          component: "EventCard",
          filesTouched: 1,
          screensUsing: `>=${eventCardUsedBy.length}`,
        },
        {
          name: "supersede",
          flow: "sign-up",
          screen: "01-Email-Default",
          text: "Email address",
          newText: "Email",
          supersededBy: "screen",
        },
        {
          name: "twoIncludes",
          flow: "buy-tickets",
          screen: "01-Tickets-Default",
          text: "Help centre",
          newText: "Support",
          note: "appears in Header and in the help link; lands in the include, reported once",
        },
        {
          name: "table",
          flow: "ticket-types",
          screen: "01-List-Default",
          text: "General admission",
          newText: "General entry",
          filesTouched: containing("ticket-types", "01", "General admission"),
        },
        {
          name: "mobileOnly",
          flow: "transfer-a-ticket",
          screen: "02-Confirm-Default",
          text: "Confirm and pay",
          newText: "Confirm & pay",
          filesTouched: containing("transfer-a-ticket", "02", "Confirm and pay"),
        },
      ],
    },
    release2: {
      removedStep: { flow: "seat-map", step: "02", id: "Row" },
      addedStep: { flow: "wallet", id: "Cards", kind: "form", copiesOf: "02" },
      // "from" as the plugin derived it from the file name on adopt (Custom-3dsecure), "to" as the designer writes it
      renamedState: {
        flow: "buy-tickets",
        step: "03",
        from: "Custom-3dsecure",
        to: "Custom-ThreeDS",
      },
      includeOnly: "Footer",
      deletedFlow: "promo-codes",
      renamedFlow: { from: "team", to: "organizer-team" },
    },
    B: {
      staleEdit: {
        flow: "sign-up",
        screen: "01-Email-Default",
        text: "Email address",
        note: "text changed in release 2, must become needsManual",
      },
      orphanComment: { flow: "seat-map", screen: "02-Row-Default", version: 1 },
      waiverOnPresent: { flow: "request-a-refund", step: "02", state: "Validation" },
    },
    release3: { subset: ["sign-up", "sign-in", "wallet", "reports", "help-centre"] },
    release4: { forced: true, noop: true },
  };
}
/** The xl profile: twenty-one flows (see FLOWS_XL comment), a bigger design system, dedupe, and rounds. */
export function generateXl(out) {
  const dir = resolve(out);
  const design = join(dir, "design");
  rmSync(join(design, "flows"), { recursive: true, force: true });
  mkdirSync(join(design, "components"), { recursive: true });
  for (const [f, c] of Object.entries(COMPONENTS_XL))
    writeFileSync(join(design, "components", f), c);
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
  const key = {
    profile: "xl",
    product: PRODUCT,
    flows: [],
    components: {},
    edits: {},
    dedupe: null,
    rounds: null,
    stress: null,
  };
  const hashes = new Map(); // sha256(file) → occurrences, for the dedupe count
  let totalScreens = 0;
  for (const flow of FLOWS_XL) {
    const fdir = join(design, "flows", flow.slug);
    mkdirSync(fdir, { recursive: true });
    const k = {
      slug: flow.slug,
      title: flow.title,
      devices: flow.devices,
      mobileFirst: !!flow.mobileFirst,
      main: !!flow.main,
      steps: [],
      entry: null,
      transitions: [],
      crossFlow: [],
      gaps: [],
      files: 0,
      next: [],
      sizes: [],
      identical: [],
    };
    // step id and state names as the plugin will derive them from the desktop file name
    const derive = (n, st, state) =>
      guessStem(fileOf(n, st, state, "desktop", flow.oddNames).replace(/\.html$/, ""));
    const idOf = (i) => derive(nn(i), flow.steps[i], "Default").stepId;
    flow.steps.forEach((st, i) => {
      const n = nn(i);
      const states = statesOf(st);
      const tooLarge = st.sizeMB > 4; // the Default file exists but the plugin refuses to scan or bundle it
      const nameOf = (state) => derive(n, st, state).state;
      const ks = {
        n,
        id: idOf(i),
        kind: st.kind,
        states: states.map(nameOf),
        missing: st.missing || [],
        custom: (st.extra || []).filter((s) => s.startsWith("Custom-")).map(nameOf),
        weird: !!st.weird,
        mobileOnlyStates: (st.mobileOnlyStates || []).map(nameOf),
        tooLarge: tooLarge ? ["Default"] : [],
        filesByState: {},
      };
      k.steps.push(ks);
      for (const state of states) {
        for (const device of devicesForXl(flow, st, state)) {
          const f = fileOf(n, st, state, device, flow.oddNames);
          const html = page(flow, st, state, n, i, device);
          writeFileSync(join(fdir, f), html);
          k.files++;
          if (tooLarge && state === "Default") continue; // written, never a screen on the portal
          (ks.filesByState[nameOf(state)] ??= []).push(device);
          totalScreens++;
          hashes.set(createHash("sha256").update(html).digest("hex"), true);
        }
        if (flow.sharedLoading && state === "Loading")
          k.identical.push({ kind: "sharedLoading", step: n, state });
      }
      if (st.identicalDefaultSuccess)
        k.identical.push({
          kind: "identicalDefaultSuccess",
          step: n,
          states: ["Default", "Success"],
        });
      if (st.sizeMB) k.sizes.push({ step: n, mb: st.sizeMB });
      if (tooLarge)
        k.gaps.push({
          kind: "too-large",
          where: `design/flows/${flow.slug}/${fileOf(n, st, "Default", "desktop", flow.oddNames)}`,
        });
      const next = flow.steps[i + 1];
      // a transition into or out of a too-large screen cannot be scanned, so the key does not expect it
      if (next && !tooLarge && !(next.sizeMB > 4)) {
        const from = `${n}-${idOf(i)}-Default`;
        const to = `${nn(i + 1)}-${idOf(i + 1)}-Default`;
        const label =
          st.kind === "form"
            ? st.id === "Payment"
              ? "Pay COP 180.000"
              : "Continue"
            : st.kind === "confirmation"
              ? "Confirm and pay"
              : st.kind === "result"
                ? "Back to events"
                : "Continue";
        k.transitions.push({ from, on: label, to });
      }
      for (const l of st.links || []) {
        k.crossFlow.push({ from: `${n}-${idOf(i)}`, to: l.flow, label: l.label });
        pushDedup(k.next, l.flow, l.label);
      }
      for (const m of st.missing || []) k.gaps.push({ kind: "state-missing", where: `${n} ${m}` });
      if (st.brokenLink) k.gaps.push({ kind: "broken-link", where: `${n} ${st.brokenLink}` });
      if (st.brokenInclude)
        k.gaps.push({ kind: "broken-include", where: `${n} ${st.brokenInclude}` });
    });
    // every flow but help-centre links to it from its last step's Default screen
    if (flow.slug !== "help-centre") {
      const lastN = nn(flow.steps.length - 1);
      k.crossFlow.push({
        from: `${lastN}-${idOf(flow.steps.length - 1)}`,
        to: "help-centre",
        label: "Help centre",
      });
      pushDedup(k.next, "help-centre", "Help centre");
    }
    k.entry = `01-${idOf(0)}`;
    if (flow.main) writeFileSync(join(fdir, "Main.html"), MAIN(flow));
    key.flows.push(k);
  }
  key.dedupe = { distinctScreens: hashes.size, totalScreens };
  key.components = {
    files: Object.keys(COMPONENTS_XL).map((f) => f.replace(".html", "")),
    nested: { Header: ["Logo"] },
    usedBy: {
      Stepper: FLOWS_XL.filter((f) => f.showsStepper).map((f) => f.slug),
      EventCard: FLOWS_XL.filter((f) => f.showsEventCard).map((f) => f.slug),
    },
    unused: ["Buttons", "Inputs", "Legacy"],
    stylesInHead: true,
  };
  key.rounds = buildRoundsXl(design, key);
  writeFileSync(join(dir, "BRIEF.md"), brief(FLOWS_XL));
  writeFileSync(join(dir, "answer-key.json"), JSON.stringify(key, null, 2) + "\n");
  if (!existsSync(join(dir, ".gitignore")))
    writeFileSync(
      join(dir, ".gitignore"),
      "design/**/bundle/\ndesign/**/.seed/\ndesign/**/.review/\n.mcp.local.json\n.DS_Store\n",
    );
  return key;
}
// limit checks: refused by the portal, must fail cleanly
const STRESS = [
  {
    slug: "stress-files",
    title: "Stress: too many files",
    goal: "A flow with 450 files; the portal accepts at most 400.",
    devices: ["desktop", "mobile"],
    steps: Array.from({ length: 45 }, (_, i) => ({
      id: `Step${i + 1}`,
      kind: "form",
      extra: ["Selected"],
    })),
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
  if (opts?.profile === "xl") return generateXl(out);
  const key = origGenerate(out, opts);
  if (opts?.stress) {
    const f = join(resolve(out), "design", "flows", "stress-bytes", "01-huge-default.html");
    writeFileSync(
      f,
      `<!doctype html><html><head><meta charset="utf-8"><title>Huge</title></head><body><h1>Huge</h1><pre>${"x".repeat(21 * 1024 * 1024)}</pre></body></html>\n`,
    );
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
  const pi = a.indexOf("--profile");
  const profile = pi >= 0 ? a[pi + 1] : "small";
  if (!out || a.indexOf("--out") < 0) {
    console.error("usage: node gen.mjs --out <dir> [--profile xl] [--stress]");
    process.exit(2);
  }
  const key = generateAll(out, { stress: a.includes("--stress"), profile });
  console.log(
    `${key.flows.length} flows, ${key.flows.reduce((n, f) => n + f.files, 0)} screen files, ${key.components.files.length} components → ${resolve(out)}`,
  );
}
