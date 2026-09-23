// The library on a scratch static-HTML prototype: scan, propose, write, gaps, bundle, edits, digest.
//   node --test "server/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanPrototype,
  proposeFlows,
  writeFlows,
  gapsOf,
  readFlow,
  guessStem,
  resolveStates,
} from "../lib/flows.mjs";
import { buildFlowBundle, buildComponentsBundle } from "../lib/bundle.mjs";
import { editsApply, digest, mergeStructure } from "../lib/portal.mjs";
import { flatten, readProduct } from "../lib/proto.mjs";
import { compareVersions, updateAdvice, PLUGIN_VERSION, PLUGIN_ROOT } from "../lib/setup.mjs";
import { generateAll } from "../../pilot/suite/gen.mjs";
import { createHash } from "node:crypto";

const page = (title, body, extra = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>body{font-family:sans-serif}</style>
</head>
<body>
<dc-import name="Navbar"></dc-import>
<main>
<h1>${title}</h1>
${body}
</main>
${extra}
</body>
</html>
`;
/** A two-step signup prototype with an include, links, a mobile variant and a state gap. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "proto-"));
  mkdirSync(join(dir, "design", "components"), { recursive: true });
  mkdirSync(join(dir, "design", "flows", "signup"), { recursive: true });
  writeFileSync(
    join(dir, "design", "components", "Navbar.html"),
    `<nav><a href="#">Home</a><span>Sign in</span></nav>\n`,
  );
  const f = (n, c) => writeFileSync(join(dir, "design", "flows", "signup", n), c);
  f(
    "email.html",
    page(
      "Enter your email",
      `<form><input type="email"><a href="email-validation.html" data-on="Continue with a bad email">Continue</a><a href="done-success.html">Continue</a></form>`,
    ),
  );
  f(
    "email-m.html",
    page(
      "Enter your email",
      `<form><input type="email"><a href="done-success.html">Continue</a></form>`,
    ),
  );
  f(
    "email-validation.html",
    page(
      "Enter your email",
      `<form><input type="email"><p role="alert">Enter a valid email address</p></form>`,
    ),
  );
  f("done-success.html", page("You are in", `<p>Welcome aboard</p>`));
  writeFileSync(
    join(dir, "PRODUCT.md"),
    "# Product\n\n## Product Purpose\nAcme Mail is email for teams who hate email.\n",
  );
  return dir;
}

test("guessStem reads numbers, steps, states and custom states from file names", () => {
  assert.deepEqual(guessStem("02-details-validation"), {
    n: "02",
    stepId: "Details",
    state: "Validation",
  });
  assert.deepEqual(guessStem("client"), { n: null, stepId: "Client", state: "Default" });
  assert.deepEqual(guessStem("ReviewSubmitting"), {
    n: null,
    stepId: "Review",
    state: "Submitting",
  });
  assert.deepEqual(guessStem("plan-custom-trial-extended"), {
    n: null,
    stepId: "Plan",
    state: "Custom-TrialExtended",
  });
});

test("scan → propose → write → gaps on a plain HTML prototype", () => {
  const dir = scratch();
  const scan = scanPrototype(dir);
  assert.equal(scan.screens.length, 4);
  assert.deepEqual(
    scan.components.map((c) => c.id),
    ["CmpNavbar"],
  );
  assert.equal(scan.components[0].usedBy.length, 4);
  assert.equal(scan.unassigned.length, 4);
  assert.deepEqual(readProduct(dir), {
    name: "Acme Mail",
    summary: "Acme Mail is email for teams who hate email.",
  });
  const prop = proposeFlows(dir, scan);
  assert.equal(prop.flows.length, 1);
  const flow = prop.flows[0];
  assert.equal(flow.slug, "signup");
  assert.deepEqual(
    flow.steps.map((s) => `${s.n}-${s.id}`),
    ["01-Email", "02-Done"],
  );
  assert.equal(flow.steps[0].kind, "form");
  assert.equal(flow.steps[1].kind, "result");
  assert.deepEqual(flow.steps[0].states, {
    Default: { desktop: "email.html", mobile: "email-m.html" },
    Validation: "email-validation.html",
  });
  assert.deepEqual(flow.steps[1].states, { Success: "done-success.html" });
  assert.ok(
    flow.transitions.some(
      (t) =>
        t.from === "01-Email-Default" &&
        t.to === "01-Email-Validation" &&
        t.on === "Continue with a bad email",
    ),
  );
  assert.ok(
    flow.transitions.some(
      (t) => t.from === "01-Email-Default" && t.to === "02-Done-Success" && t.on === "Continue",
    ),
  );
  assert.deepEqual(flow.entryPoints, [{ from: "?", to: "01-Email" }]);
  const q = prop.questions.filter((x) => x.flow === "signup");
  assert.ok(q.some((x) => x.field === "steps.01.states" && x.why.includes("Submitting")));
  assert.ok(!q.some((x) => x.field === "title"), "a sure title is shown, not asked");
  assert.ok(
    !q.some((x) => /^steps\.\d+\.kind$/.test(x.field)),
    "a sure kind is shown, not asked",
  );
  assert.ok(!q.some((x) => x.field === "entryPoints"), "one unlinked step is a sure entry point");
  assert.equal(flow.confidence.steps["01"], "sure");
  assert.equal(flow.confidence.steps["02"], "sure");
  assert.equal(flow.confidence.entryPoints, "sure");
  const goalQ = q.find((x) => x.field === "goal");
  assert.ok(goalQ, "goal is always a question");
  assert.equal(goalQ.confidence, "unknown");
  assert.ok(
    q.every((x) => x.confidence !== "sure"),
    "a sure inference is never asked",
  );
  // the designer answers: waive two states, name the entry point
  flow.steps[0].states.Submitting = "n/a: instant, no network call";
  flow.entryPoints = [{ from: "Landing: Get started", to: "01-Email" }];
  flow.goal = "Create an account with an email";
  const w = writeFlows(dir, {
    flows: [flow],
    prototype: {
      product: { name: "Acme Mail", summary: "Email for teams" },
      devices: { desktop: { w: 1440, h: 900 }, mobile: { w: 390, h: 844 } },
    },
  });
  assert.ok(w.written.includes("design/prototype.json"));
  const fj = readFlow(join(dir, "design", "flows", "signup"));
  assert.equal(fj.schema, 2);
  assert.equal(fj.order, 1);
  assert.equal(fj.steps[0].states.Submitting, "n/a: instant, no network call");
  const gaps = gapsOf(dir).gaps;
  assert.deepEqual(gaps.map((g) => g.kind + ":" + g.where).sort(), [
    "state-missing:01 Error",
    "state-missing:02 Default",
  ]);
  assert.equal(gapsOf(dir, { strict: true }).gaps.length, 2);
  assert.equal(scanPrototype(dir).unassigned.length, 0, "declared files are not proposed again");
  assert.equal(proposeFlows(dir).flows.length, 0);
});

test("a step with two markup signals is a guessed kind; two unlinked steps make the entry point a guess", () => {
  const dir = scratch();
  // nothing links to plans.html, and nothing on it links out: an unlinked step, like Email
  writeFileSync(
    join(dir, "design", "flows", "signup", "plans.html"),
    page("Plans", `<form><input type="text" name="q"></form><table><tr><td>Row</td></tr></table>`),
  );
  const prop = proposeFlows(dir);
  const flow = prop.flows[0];
  const plans = flow.steps.find((s) => s.id === "Plans");
  assert.ok(plans, "plans.html becomes its own step");
  assert.equal(flow.confidence.steps[plans.n], "guess", "a form and a table both point at a kind");
  assert.equal(flow.confidence.entryPoints, "guess", "two unlinked steps: no single sure entry");
  const q = prop.questions.filter((x) => x.flow === "signup");
  const entryQ = q.find((x) => x.field === "entryPoints");
  assert.ok(entryQ, "asked because the entry is not sure");
  assert.equal(entryQ.confidence, "guess");
  assert.equal(entryQ.candidates.length, 2);
});

test("the title comes from a shared screen-title prefix", () => {
  const dir = mkdtempSync(join(tmpdir(), "proto-"));
  mkdirSync(join(dir, "design", "flows", "checkout"), { recursive: true });
  writeFileSync(join(dir, "design", "flows", "checkout", "cart.html"), page("Checkout · Cart", "<p>Cart</p>"));
  writeFileSync(
    join(dir, "design", "flows", "checkout", "pay.html"),
    page("Checkout · Pay", `<form><input type="text"></form>`),
  );
  const flow = proposeFlows(dir).flows[0];
  assert.equal(flow.title, "Checkout");
  assert.equal(flow.confidence.title, "sure");
});

test("the bundle names screens by id, inlines includes, rewrites links and infers transitions", () => {
  const dir = scratch();
  const flow = proposeFlows(dir).flows[0];
  // a Loading state on both steps, so the grid has a state more steps use than Validation
  for (const f of ["email-loading.html", "done-loading.html"])
    writeFileSync(join(dir, "design", "flows", "signup", f), page("Loading", "<p>…</p>"));
  flow.steps[0].states.Loading = "email-loading.html";
  flow.steps[1].states.Loading = "done-loading.html";
  flow.steps[0].states.Submitting = "n/a: instant";
  flow.steps[0].states.Error = "n/a: no server";
  flow.steps[1].states.Default = "n/a: success is the view";
  writeFlows(dir, { flows: [flow] });
  const b = buildFlowBundle(dir, "signup");
  assert.equal(b.ok, true, b.errors.join("; "));
  assert.deepEqual(b.entries.map((e) => e.path).sort(), [
    "screens/01-Email-Default-Mobile.html",
    "screens/01-Email-Default.html",
    "screens/01-Email-Loading.html",
    "screens/01-Email-Validation.html",
    "screens/02-Done-Loading.html",
    "screens/02-Done-Success.html",
  ]);
  const m = b.manifest;
  assert.equal(m.product.name, "Acme Mail");
  const first = m.screens.find((s) => s.id === "01-Email-Default");
  assert.deepEqual(first.includes, ["CmpNavbar"]);
  assert.equal(first.devices.desktop.source, "email.html");
  assert.equal(first.devices.mobile.source, "email-m.html");
  assert.equal(first.devices.mobile.w, 390);
  const html = readFileSync(
    join(dir, "design", "flows", "signup", "bundle", "screens", "01-Email-Default.html"),
    "utf8",
  );
  assert.ok(html.includes('data-imported-component="Navbar"'), "include inlined");
  assert.ok(html.includes('href="02-Done-Success.html"'), "link rewritten to the screen id");
  assert.ok(!html.includes("dc-import"), "no include holes left");
  assert.ok(m.transitions.some((t) => t.from === "01-Email-Default" && t.to === "02-Done-Success"));
  assert.ok(m.steps[0].states.some((s) => s.state === "Submitting" && s.waived === "instant"));
  // deterministic: a rebuild of unchanged sources gives the same hash
  assert.equal(buildFlowBundle(dir, "signup").contentHash, b.contentHash);
  // no canvas.json: a grid, one row per step, one column per state, mobile beside desktop
  assert.equal(m.layout, "grid");
  const L = (id, dev) => m.screens.find((s) => s.id === id).devices[dev].layout;
  assert.deepEqual(L("01-Email-Default", "desktop"), { x: 0, y: 0 });
  assert.deepEqual(L("01-Email-Default", "mobile"), { x: 1440 + 60, y: 0 });
  assert.equal(L("01-Email-Validation", "desktop").y, 0);
  assert.ok(L("01-Email-Validation", "desktop").x > 1440 + 60 + 390);
  assert.ok(L("02-Done-Success", "desktop").y >= 900 + 160);
  // columns by use: Loading (two steps) sits left of Validation (one step); Success, used once and
  // later in the vocabulary, sits right of Validation
  assert.ok(L("01-Email-Loading", "desktop").x < L("01-Email-Validation", "desktop").x);
  assert.equal(L("01-Email-Loading", "desktop").x, L("02-Done-Loading", "desktop").x);
  assert.ok(L("02-Done-Success", "desktop").x > L("01-Email-Validation", "desktop").x);
  assert.match(first.devices.desktop.sourceSha256, /^sha256:[0-9a-f]{64}$/);
  const c = buildComponentsBundle(dir);
  assert.equal(c.ok, true);
  assert.deepEqual(
    c.manifest.screens.map((s) => s.id),
    ["CmpNavbar"],
  );
  assert.ok(
    c.files[0].content.startsWith("<!doctype html>"),
    "a fragment is wrapped into a document",
  );
});

test("a broken include and a broken file are blocking gaps and bundle errors", () => {
  const dir = scratch();
  const flow = proposeFlows(dir).flows[0];
  flow.steps[0].states.Loading = "missing.html";
  writeFlows(dir, { flows: [flow] });
  writeFileSync(
    join(dir, "design", "flows", "signup", "done-success.html"),
    page("You are in", `<dc-import name="Footer"></dc-import>`),
  );
  const g = gapsOf(dir);
  assert.ok(g.blocking.some((x) => x.kind === "broken-file"));
  assert.ok(g.blocking.some((x) => x.kind === "broken-include"));
  const b = buildFlowBundle(dir, "signup");
  assert.equal(b.ok, false);
  assert.ok(b.errors.some((e) => /missing\.html/.test(e)));
  assert.ok(b.errors.some((e) => /Footer/.test(e)));
});

test("copy edits land in the screen, in the other device, or in the include that holds the text", () => {
  const dir = scratch();
  const flow = proposeFlows(dir).flows[0];
  writeFlows(dir, { flows: [flow] });
  const fdir = join(dir, "design", "flows", "signup");
  const edit = (id, screen, device, originalText, newText) => ({
    id,
    flowVersion: 1,
    screen: { id: screen, device },
    elementPath: "b",
    componentRef: null,
    originalText,
    originalHash: "x",
    newText,
    author: { name: "Client", role: "client" },
    status: "pending",
    createdAt: "2026-09-16T10:00:00Z",
    updatedAt: "2026-09-16T10:00:00Z",
  });
  writeFileSync(
    join(fdir, "text-edits.json"),
    JSON.stringify({
      schema: 1,
      edits: [
        edit("e1", "01-Email-Default", "desktop", "Enter your email", "Your work email"),
        edit("e2", "01-Email-Default", "desktop", "Sign in", "Log in"),
        edit("e3", "02-Done-Success", "desktop", "Not on the page", "Whatever"),
      ],
    }),
  );
  const r = editsApply(dir, "signup");
  assert.equal(r.applied, 2);
  assert.equal(r.needsManual.length, 1);
  assert.equal(r.needsManual[0].id, "e3");
  assert.ok(readFileSync(join(fdir, "email.html"), "utf8").includes("<h1>Your work email</h1>"));
  assert.ok(
    readFileSync(join(fdir, "email-m.html"), "utf8").includes("<h1>Your work email</h1>"),
    "the mobile variant follows",
  );
  assert.ok(
    readFileSync(join(dir, "design", "components", "Navbar.html"), "utf8").includes("Log in"),
    "edited once in the include",
  );
  const e2 = r.results.find((x) => x.id === "e2");
  assert.ok(
    e2.files.some((f) => f.include === "Navbar" && f.result === "applied" && f.screensUsing === 4),
  );
  const d = digest(dir);
  assert.equal(d.items.length, 3);
  assert.equal(d.items[0].kind, "edit");
  assert.equal(d.items[0].file, "design/flows/signup/email.html");
});

test("portal structure merges into flow.json; a file wins over a waiver", () => {
  const dir = scratch();
  const flow = proposeFlows(dir).flows[0];
  writeFlows(dir, { flows: [flow] });
  const fdir = join(dir, "design", "flows", "signup");
  const fj = readFlow(fdir);
  const changes = mergeStructure(
    fj,
    fdir,
    {
      waivers: { "01": { Error: "no server call", Validation: "portal says so" } },
      stepTitles: { "01": "Your email" },
      entryPoints: [{ from: "Nav", to: "01-Email" }],
    },
    3,
  );
  assert.deepEqual(changes.map((c) => c.kind).sort(), [
    "entry-points",
    "order",
    "step-title",
    "waiver",
    "waiver-ignored",
  ]);
  assert.equal(fj.steps[0].states.Error, "n/a: no server call");
  assert.equal(
    fj.steps[0].states.Validation,
    "email-validation.html",
    "the designed state keeps its file",
  );
  assert.equal(fj.steps[0].title, "Your email");
  assert.equal(fj.order, 3);
});

test("flatten keeps .dc.html output on the previous flattener's template", () => {
  const dir = mkdtempSync(join(tmpdir(), "dc-"));
  writeFileSync(
    join(dir, "Cmp.dc.html"),
    `<html><head><script src="./support.js"></script></head><body><x-dc><helmet><style>p{color:red}</style></helmet><p>nav</p></x-dc></body></html>`,
  );
  writeFileSync(
    join(dir, "01-A-Default.dc.html"),
    `<html><head><script src="./support.js"></script></head><body><x-dc><helmet><style>body{margin:0}</style></helmet><div><dc-import name="Cmp" hint-size="100%,72px"></dc-import><h1>Hi</h1></div></x-dc></body></html>`,
  );
  const r = flatten(join(dir, "01-A-Default.dc.html"), { componentDirs: [dir], project: dir });
  assert.deepEqual(r.includes, ["Cmp"]);
  assert.ok(r.html.startsWith('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">'));
  assert.ok(
    r.html.includes(
      "<!-- generated by designli-design from 01-A-Default.dc.html; do not edit, edit the .dc.html source and re-run handoff -->",
    ),
  );
  assert.ok(
    r.html.includes(
      `<!-- begin Cmp --><div data-imported-component="Cmp"><p>nav</p></div><!-- end Cmp -->`,
    ),
  );
  assert.ok(!r.html.includes("hint-size"));
  assert.ok(existsSync(dir));
});

test("compareVersions orders numerically with prereleases first; updateAdvice speaks only when needed", () => {
  assert.equal(compareVersions("0.1.0", "0.2.0"), -1);
  assert.equal(compareVersions("0.10.0", "0.9.1"), 1);
  assert.equal(compareVersions("1.0.0-beta", "1.0.0"), -1);
  assert.equal(compareVersions("v1.2", "1.2.0"), 0);
  assert.equal(compareVersions("garbage", "1.0.0"), 0);
  assert.equal(updateAdvice({}).message, null);
  assert.equal(updateAdvice({ latest: PLUGIN_VERSION }).updateAvailable, false);
  const newer = updateAdvice({ latest: "99.0.0" });
  assert.equal(newer.updateAvailable, true);
  assert.equal(newer.updateRequired, false);
  assert.ok(newer.message.includes("/plugin marketplace update designli-tools"));
  assert.ok(newer.message.includes("/plugin update designli-design@designli-tools"));
  const required = updateAdvice({ latest: "99.0.0", minimum: "99.0.0" });
  assert.equal(required.updateRequired, true);
  assert.ok(required.message.startsWith("This plugin"));
});

test("plugin.json and marketplace.json carry the same version", () => {
  const plugin = JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const market = JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.equal(plugin.version, PLUGIN_VERSION);
  assert.equal(market.plugins[0].version, plugin.version);
});

test("component sheets render inside a host screen's head; unused ones fall back to Styles or warn", () => {
  const dir = scratch();
  writeFlows(dir, { flows: [proposeFlows(dir).flows[0]] });
  // an include nobody imports, before and after a shared Styles include exists
  writeFileSync(join(dir, "design", "components", "Card.html"), `<div class="card">Card</div>\n`);
  let b = buildComponentsBundle(dir);
  assert.equal(b.ok, true, b.errors.join("; "));
  const sheet = (id) => readFileSync(join(dir, "design", "components", "bundle", "screens", `${id}.html`), "utf8");
  const nav = sheet("CmpNavbar");
  assert.ok(nav.includes("<title>Navbar</title>"), "titled by the component");
  assert.ok(nav.includes("<style>body{font-family:sans-serif}</style>"), "the host screen's styles come along");
  assert.ok(nav.includes('data-imported-component="Navbar"') || nav.includes("<nav>"), "the fragment is the body");
  assert.ok(!nav.includes("<h1>"), "nothing of the host's body leaks in");
  assert.equal(b.manifest.screens.find((s) => s.id === "CmpNavbar").devices.desktop.w, 1440, "sized to the host device");
  assert.equal(b.manifest.devices.desktop.w, 1440);
  assert.ok(!sheet("CmpCard").includes("font-family:sans-serif"), "no host, no borrowed styles");
  assert.ok(b.warnings.some((w) => w.startsWith("CmpCard:") && w.includes("without the screens' styles")), b.warnings.join("; "));
  writeFileSync(join(dir, "design", "components", "Styles.html"), `<style>.card{border:1px solid}</style>\n`);
  b = buildComponentsBundle(dir);
  assert.ok(sheet("CmpCard").includes(".card{border:1px solid}"), "the Styles include dresses an unused component");
  assert.ok(b.warnings.some((w) => w.startsWith("CmpCard:") && w.includes("uses the Styles include")));
  assert.ok(!b.warnings.some((w) => w.startsWith("CmpStyles:")), "the Styles include itself is not reported");
});

test("an include's external script is hoisted into the host's head", () => {
  const dir = scratch();
  writeFileSync(
    join(dir, "design", "components", "Navbar.html"),
    `<!doctype html><html><head><script src="https://cdn.tailwindcss.com/3.4.1"></script><style>nav{display:flex}</style></head><body><nav>Home</nav></body></html>\n`,
  );
  const html = flatten(join(dir, "design", "flows", "signup", "email.html"), {
    componentDirs: [join(dir, "design", "components")],
    project: dir,
  }).html;
  const head = html.match(/<head[\s\S]*?<\/head>/i)[0];
  assert.ok(head.includes('<script src="https://cdn.tailwindcss.com/3.4.1"></script>'));
  assert.ok(head.includes("nav{display:flex}"));
});

test("a flow's devices come from its files: mobile variants make it a two-device flow, none keeps it desktop", () => {
  const dir = scratch();
  mkdirSync(join(dir, "design", "flows", "cancel"), { recursive: true });
  writeFileSync(join(dir, "design", "flows", "cancel", "find.html"), page("Find your pass", "<form><input></form>"));
  const proposed = proposeFlows(dir).flows;
  const signup = proposed.find((f) => f.slug === "signup");
  const cancel = proposed.find((f) => f.slug === "cancel");
  assert.deepEqual(signup.devices, ["desktop", "mobile"]);
  assert.deepEqual(cancel.devices, ["desktop"]);
  writeFlows(dir, { flows: proposed });
  assert.ok(buildFlowBundle(dir, "signup").manifest.devices.mobile, "the manifest lists mobile, so the portal enables the toggle");
  assert.equal(buildFlowBundle(dir, "cancel").manifest.devices.mobile, undefined);
  // a flow.json written by an older adopt without devices still infers mobile from its states
  const fj = join(dir, "design", "flows", "signup", "flow.json");
  const flow = JSON.parse(readFileSync(fj, "utf8"));
  delete flow.devices;
  writeFileSync(fj, JSON.stringify(flow));
  assert.ok(buildFlowBundle(dir, "signup").manifest.devices.mobile);
});

test("the suite's corpus is deterministic and its answer key matches the files", () => {
  const hashOf = (dir) => {
    const h = createHash("sha256");
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else h.update(e.name).update(readFileSync(p));
      }
    };
    walk(dir);
    return h.digest("hex");
  };
  const a = mkdtempSync(join(tmpdir(), "mq-")), b = mkdtempSync(join(tmpdir(), "mq-"));
  const key = generateAll(a, {});
  generateAll(b, {});
  assert.equal(hashOf(join(a, "design")), hashOf(join(b, "design")), "two generations differ");
  assert.equal(key.flows.length, 10);
  for (const f of key.flows) {
    const files = readdirSync(join(a, "design", "flows", f.slug)).filter((x) => x.endsWith(".html") && x !== "Main.html");
    assert.equal(files.length, f.files, `${f.slug}: ${files.length} files on disk, ${f.files} in the key`);
    const states = f.steps.reduce((n, s) => n + s.states.length, 0) * f.devices.length;
    assert.equal(f.files, states, `${f.slug}: files vs states × devices`);
  }
  assert.ok(existsSync(join(a, "design", "components", "Styles.html")));
  assert.ok(existsSync(join(a, "answer-key.json")));

  // the xl profile: same determinism, a bigger corpus, a richer key. xl-contract.md section 1 calls
  // this "the twenty flows" but its own flow-by-flow list (Fan + Organizer + Door + Cross-cutting)
  // names 21 distinct flows — sign-up..account-settings (12), create-an-event..team (7),
  // check-in-scan (1) and help-centre (1). 20 of those 21 link out to help-centre (every flow but
  // help-centre itself), which is likely where the contract's "twenty" comes from; this generator
  // writes all 21 named flows, so that is what the key and this test check.
  const ax = mkdtempSync(join(tmpdir(), "mq-xl-")), bx = mkdtempSync(join(tmpdir(), "mq-xl-"));
  const keyXl = generateAll(ax, { profile: "xl" });
  generateAll(bx, { profile: "xl" });
  assert.equal(hashOf(join(ax, "design")), hashOf(join(bx, "design")), "two xl generations differ");
  assert.equal(keyXl.profile, "xl");
  assert.equal(keyXl.flows.length, 21);
  for (const f of keyXl.flows) {
    const files = readdirSync(join(ax, "design", "flows", f.slug)).filter((x) => x.endsWith(".html") && x !== "Main.html");
    assert.equal(files.length, f.files, `${f.slug}: ${files.length} files on disk, ${f.files} in the key`);
  }
  assert.ok(keyXl.dedupe.distinctScreens < keyXl.dedupe.totalScreens, "sharedLoading/identicalDefaultSuccess should plant real duplicates");
  const nextOf = (slug) => keyXl.flows.find((f) => f.slug === slug).next;
  assert.ok(nextOf("find-an-event").length > 0, "find-an-event should carry next links");
  assert.ok(nextOf("payouts").length > 0, "payouts should carry next links");
});

test("an include that imports another include is flattened all the way down", () => {
  const dir = scratch();
  writeFileSync(join(dir, "design", "components", "Logo.html"), `<span class="logo">Acme</span>\n`);
  writeFileSync(join(dir, "design", "components", "Navbar.html"), `<nav><dc-import name="Logo"></dc-import><a href="#">Home</a></nav>\n`);
  const r = flatten(join(dir, "design", "flows", "signup", "email.html"), { componentDirs: [join(dir, "design", "components")], project: dir });
  assert.ok(!/<dc-import/.test(r.html), "no import tag left");
  assert.ok(r.html.includes('<span class="logo">Acme</span>'), "the nested include is inlined");
  assert.deepEqual(r.includes.sort(), ["Logo", "Navbar"]);
});

test("a link into another flow's folder becomes a journey connector (next)", () => {
  const dir = scratch();
  mkdirSync(join(dir, "design", "flows", "billing"), { recursive: true });
  writeFileSync(join(dir, "design", "flows", "billing", "plan.html"), page("Pick a plan", `<p><a href="../signup/email.html">Create an account first</a></p>`));
  const flows = proposeFlows(dir).flows;
  const billing = flows.find((f) => f.slug === "billing");
  assert.deepEqual(billing.next, [{ flow: "signup", on: "Create an account first" }]);
  assert.deepEqual(flows.find((f) => f.slug === "signup").next, []);
});


test("a copy edit inside an include's include (Navbar → Logo) is applied once, in the nested file", () => {
  const dir = scratch();
  writeFileSync(join(dir, "design", "components", "Logo.html"), `<span class="logo">Acme</span>\n`);
  writeFileSync(join(dir, "design", "components", "Navbar.html"), `<nav><dc-import name="Logo"></dc-import><a href="#">Home</a></nav>\n`);
  const flow = proposeFlows(dir).flows[0];
  writeFlows(dir, { flows: [flow] });
  const fdir = join(dir, "design", "flows", "signup");
  writeFileSync(
    join(fdir, "text-edits.json"),
    JSON.stringify({
      schema: 1,
      edits: [{ id: "n1", flowVersion: 1, screen: { id: "01-Email-Default", device: "desktop" }, elementPath: "b", componentRef: null, originalText: "Acme", originalHash: "x", newText: "ACME", author: { name: "Client", role: "client" }, status: "pending", createdAt: "2026-09-16T10:00:00Z", updatedAt: "2026-09-16T10:00:00Z" }],
    }),
  );
  const r = editsApply(dir, "signup");
  assert.equal(r.applied, 1, JSON.stringify(r.results));
  assert.ok(readFileSync(join(dir, "design", "components", "Logo.html"), "utf8").includes("ACME"), "edited in the nested include");
  assert.ok(!readFileSync(join(dir, "design", "components", "Navbar.html"), "utf8").includes("ACME"), "the parent include is untouched");
  assert.ok(r.results[0].files.some((f) => f.include === "Logo" && f.result === "applied"));
});

test("a screen over the size cap is declared truthfully and becomes an unavailable state, not a missing one", () => {
  const dir = scratch();
  const fdir = join(dir, "design", "flows", "signup");
  // the Default screen of step 01 is past the cap before adopt: it stays on disk, the scanner skips
  // it (undeclared), so the first propose folds it in as a pseudo-screen and it is written to
  // flow.json like any other file, truthfully, not silently dropped (no mobile sibling either).
  // Its own links are unknowable (an oversized file is never parsed), so which step number the
  // designer's other step lands on is not fixed here; find the Email step by id, not by position.
  writeFileSync(join(fdir, "email.html"), page("Enter your email", `<svg>${"<path d='M0 0h1v1z'/>".repeat(260000)}</svg>`));
  rmSync(join(fdir, "email-m.html"));
  const flow = proposeFlows(dir).flows[0];
  writeFlows(dir, { flows: [flow] });
  const fj = readFlow(fdir);
  const emailStep = fj.steps.find((s) => s.id === "Email");
  assert.ok(emailStep, "the Email step is still declared");
  assert.equal(emailStep.states.Default, "email.html", "declared, not dropped");
  const r = resolveStates(fj, fdir);
  const rEmail = r.steps.find((s) => s.id === "Email");
  assert.equal(rEmail.states.Default.status, "unavailable");
  assert.ok(rEmail.states.Default.bytes > 4 * 1024 * 1024);
  const g = gapsOf(dir);
  const tooLarge = g.gaps.filter((x) => x.kind === "too-large");
  assert.equal(tooLarge.length, 1);
  assert.equal(tooLarge[0].step, emailStep.n);
  assert.equal(tooLarge[0].state, "Default");
  assert.equal(typeof tooLarge[0].bytes, "number");
  // the Email step still reports its other missing states, never the Default the big file covers
  assert.ok(
    !g.gaps.some(
      (x) => x.kind === "state-missing" && x.step === emailStep.n && x.state === "Default",
    ),
  );
  assert.ok(
    gapsOf(dir, { strict: true }).gaps.some((x) => x.kind === "too-large"),
    "strict blocks it too",
  );
  const b = buildFlowBundle(dir, "signup");
  assert.equal(b.ok, true, b.errors.join("; "));
  const bEmail = b.manifest.steps.find((s) => s.id === "Email");
  const st0 = bEmail.states.find((s) => s.state === "Default");
  assert.equal(st0.unavailable.reason, "too-large");
  assert.ok(st0.unavailable.bytes > 4 * 1024 * 1024);
  assert.ok(
    !b.manifest.screens.some((s) => s.id === `${emailStep.n}-Email-Default`),
    "never read or bundled",
  );
  assert.ok(
    b.manifest.screens.some((s) => s.id === `${emailStep.n}-Email-Validation`),
    "the Validation screen remains",
  );
  // a second propose finds nothing left to declare for the oversized file
  assert.equal(proposeFlows(dir).flows.length, 0);
});
