// Browser checks against the portal for a suite run: the pages a designer and a client open,
// with the checks a person would do by eye. Uses design-portal's Playwright (a sibling checkout);
// skipped with a note when it is not there. Sessions come from token exchange, never a password.
import { join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { PLUGIN_ROOT } from "./lib/rpc.mjs";

const PORTAL_REPO = resolve(PLUGIN_ROOT, "..", "design-portal");

export async function uiChecks({ portal, project, staffSession, clientSession, results, flows }) {
  const out = { skipped: null, pages: {}, consoleErrors: 0, checks: {} };
  let pw;
  try {
    pw = await import(join(PORTAL_REPO, "node_modules", "playwright", "index.mjs"));
  } catch {
    try {
      pw = await import(join(PORTAL_REPO, "node_modules", "playwright", "index.js"));
    } catch (e) {
      out.skipped = `playwright not found under ${PORTAL_REPO}: ${e.message}`;
      return out;
    }
  }
  const shots = join(results, "screenshots");
  mkdirSync(shots, { recursive: true });
  const browser = await pw.chromium.launch();
  const url = new URL(portal);
  const contextFor = async (session) => {
    const [name, value] = session.value.split("=");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name, value, domain: url.hostname, path: "/", httpOnly: true, secure: url.protocol === "https:", sameSite: "Lax" }]);
    return ctx;
  };
  const visit = async (ctx, path, name, { shot = false, wait = 1500 } = {}) => {
    const page = await ctx.newPage();
    const errors = [];
    const statuses = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
    page.on("response", (r) => r.url().includes("/p/") && statuses.push(r.status()));
    const t0 = Date.now();
    const res = await page.goto(portal + path, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => ({ status: () => 0, err: e.message }));
    await page.waitForTimeout(wait);
    const entry = { path, status: res?.status?.() ?? 0, ms: Date.now() - t0, consoleErrors: errors, iframes: await page.locator("iframe").count(), screenStatuses: statuses };
    if (shot) {
      await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false }).catch(() => null);
      entry.screenshot = `screenshots/${name}.png`;
    }
    out.consoleErrors += errors.length;
    out.pages[name] = entry;
    return page;
  };
  try {
    const d = await contextFor(staffSession);
    // project page: every flow listed, thumbnails present
    let page = await visit(d, `/projects/${project}`, "project", { shot: true });
    out.checks.flowsListed = await page.locator("a[href*='/flows/']").count();
    await page.close();
    // canvases of the interesting flows
    for (const slug of flows) {
      page = await visit(d, `/projects/${project}/flows/${slug}`, `flow-${slug}`, { shot: true, wait: 2500 });
      const boards = await page.locator("iframe").count();
      const html = await page.content();
      const mobileBtn = page.getByRole("button", { name: /mobile/i }).first();
      const mobileDisabled = (await mobileBtn.count()) ? await mobileBtn.isDisabled().catch(() => null) : null;
      const rawScript = /<script>alert\("x"\)<\/script>/.test(html);
      out.checks[`flow.${slug}`] = { boards, mobileDisabled, unescapedScript: rawScript };
      // a reload must answer 304 for the screens already loaded
      const statuses = [];
      page.on("response", (r) => r.url().includes("/p/") && statuses.push(r.status()));
      await page.reload({ waitUntil: "networkidle" }).catch(() => null);
      await page.waitForTimeout(1500);
      out.checks[`flow.${slug}`].reload304 = statuses.filter((s) => s === 304).length;
      out.checks[`flow.${slug}`].reload200 = statuses.filter((s) => s === 200).length;
      await page.close();
    }
    page = await visit(d, `/projects/${project}?tab=components`, "components", { shot: true, wait: 2500 });
    out.checks.componentSheets = await page.locator("iframe").count();
    await page.close();
    page = await visit(d, `/projects/${project}?tab=releases`, "releases", { shot: true });
    out.checks.releasesText = (await page.locator("body").innerText()).slice(0, 400);
    await page.close();
    page = await visit(d, "/device?code=ZZZZ-2222", "device-bad-code");
    out.checks.deviceBadCode = /start the sign-in again|expire|not found|no pending/i.test(await page.locator("body").innerText());
    await page.close();
    page = await visit(d, "/docs/", "docs");
    out.checks.docs = out.pages.docs.status;
    await page.close();
    await d.close();
    // the client's view: no staff controls
    if (!clientSession) {
      out.checks.client = { skipped: "no client session" };
      return out;
    }
    const c = await contextFor(clientSession);
    page = await visit(c, `/projects/${project}`, "client-project", { shot: true });
    const text = await page.locator("body").innerText();
    out.checks.client = { adminLink: /\bAdmin\b/.test(text), accountLink: /Account and tokens/.test(text), sees: text.slice(0, 200) };
    await page.close();
    page = await visit(c, `/projects/${project}/flows/sign-up`, "client-flow", { shot: true, wait: 2500 });
    const ctext = await page.locator("body").innerText();
    out.checks.client.sendToAgent = /Send to agent/.test(ctext);
    out.checks.client.commentsPanel = /Comments/.test(ctext);
    await page.close();
    await c.close();
  } catch (e) {
    out.error = e.message;
  } finally {
    await browser.close();
  }
  return out;
}
