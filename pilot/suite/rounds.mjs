// The multi-release scenario of the XL corpus: four releases with a scripted client between them,
// portal-side structure edits, a step removed and one added, a state renamed, an include-only
// change, a flow deleted and one renamed locally, orphaned comments, a stale copy edit, subset and
// no-op publishes, one deliberate force, the developer's end through /mcp, and concurrency at
// scale. Called by run.mjs with --corpus xl --rounds; writes obs.rounds, obs.journey, obs.mcp,
// obs.dedupe and extends obs.concurrency. Every observation shape is the one in xl-contract.md.
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { textHash, McpHttp } from "./lib/api.mjs";
import { PLUGIN_ROOT } from "./lib/rpc.mjs";

export async function runRounds(ctx) {
  const { api, PORTAL, PROJECT, REPO, REMOTE, key, obs, mcp, tool, sh, say, timed, secretFile, tokens } = ctx;
  const { admin, designer, client, dev } = tokens;
  const R = key.rounds;
  const flowOf = (slug) => `/projects/${PROJECT}/flows/${slug}`;
  const latest = async (slug) => (await api.get(designer, `${flowOf(slug)}/versions/latest`)).json;
  const notes = [];
  const note = (s) => {
    notes.push(`- ${new Date().toISOString().slice(11, 19)} ${s}`);
    say(`  ${s}`);
  };
  const countNew = (text) => Number(sh(`grep -rl --exclude-dir=bundle --include='*.html' -- ${JSON.stringify(text)} design | wc -l`).trim());
  const commit = (m) => sh(`git add -A && git -c user.email=suite@designli.co -c user.name=Suite commit -qm ${JSON.stringify(m)} -q || true; git push -q`);
  obs.rounds = {};

  // ---- the journey as the portal drew it after release 1 ----
  await timed("journey", async () => {
    const flows = (await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? [];
    const connectors = flows.reduce((n, f) => n + (f.next?.length ?? 0), 0);
    const expected = key.flows.reduce((n, f) => n + (f.next?.length ?? 0), 0);
    const nextOf = (s) => (flows.find((f) => f.id === s)?.next ?? []).map((n) => n.flow);
    obs.journey = { connectors, expected, loop: nextOf("my-tickets").includes("transfer-a-ticket") && nextOf("transfer-a-ticket").includes("my-tickets"), flowsOnPortal: flows.length };
    obs.dedupe = { distinctScreens: key.dedupe?.distinctScreens ?? null, totalScreens: key.dedupe?.totalScreens ?? null, portalBytes: null };
    note(`journey: ${connectors} connectors on the portal, ${expected} expected, loop ${obs.journey.loop}`);
  });

  // ---- client round A, on v1 ----
  await timed("roundA", async () => {
    const A = { comments: { posted: 0, statuses: {} }, edits: { posted: 0, ids: {} }, waivers: {}, structure: {}, agentThreads: [], reopened: {} };
    obs.rounds.A = A;
    const comment = async (slug, body, who = client) => {
      const r = await api.post(who, `${flowOf(slug)}/comments`, body);
      A.comments.posted++;
      A.comments.statuses[r.status] = (A.comments.statuses[r.status] || 0) + 1;
      return r;
    };
    // two comments on each of twelve flows: a screen-level one, then a mobile or flow-level one
    const twelve = key.flows.slice(0, 12);
    const firstThreads = [];
    for (const f of twelve) {
      const v = await latest(f.slug);
      if (!v?.manifest) continue;
      const states = v.manifest.screens.filter((s) => s.kind === "state");
      const s0 = states[0];
      const dev0 = s0.devices.desktop ? "desktop" : "mobile";
      const r1 = await comment(f.slug, { text: `${f.title}: the primary action needs more contrast on this screen.`, screen: { id: s0.id, device: dev0 }, anchor: { x: 60, y: 70 }, flowVersion: v.number });
      if (r1.json?.id) firstThreads.push({ flow: f.slug, id: r1.json.id });
      const mob = states.find((s) => s.devices.mobile);
      if (mob) await comment(f.slug, { text: `On the phone the ${mob.title} header wraps to three lines.`, screen: { id: mob.id, device: "mobile" }, anchor: { x: 50, y: 20 }, flowVersion: v.number });
      else await comment(f.slug, { text: `Overall ${f.title.toLowerCase()} reads well; the order of the steps makes sense.`, flowVersion: v.number });
    }
    const bt = await latest("buy-tickets");
    await comment("buy-tickets", { text: "The map shows Seats before Tickets; should it not be the other way round?", screen: { id: "Main", device: "desktop" }, anchor: { x: 30, y: 30 }, flowVersion: bt.number });
    // on the screen release 2 removes: this thread must survive as an orphan of v1
    const rm = R.release2.removedStep;
    await comment(rm.flow, { text: "Can the row picker show the price per row?", screen: { id: `${rm.step}-${rm.id}-Default`, device: "desktop" }, anchor: { x: 20, y: 30 }, flowVersion: (await latest(rm.flow)).number });
    const long = await comment("sign-up", { text: "x".repeat(4000), flowVersion: 1 });
    const tooLong = await comment("sign-up", { text: "x".repeat(4001), flowVersion: 1 });
    const md = await comment("sign-up", { text: '**Bold claim**: this works. <img src=x onerror="alert(1)"> `code` and a [link](https://example.com)', screen: { id: "01-Email-Default", device: "desktop" }, anchor: { x: 10, y: 10 }, flowVersion: 1 });
    A.comments.xssStoredVerbatim = md.json?.text?.includes("onerror") ?? null;
    const es = await comment("find-an-event", { text: "¿Podría el botón decir «Buscar eventos» en lugar de «Buscar»? 🎟️ Gracias, se ve muy bien.", flowVersion: 1 });
    A.comments.long = { at4000: long.status, at4001: tooLong.status, spanish: es.status };
    note(`round A: ${A.comments.posted} comments (${JSON.stringify(A.comments.statuses)})`);
    // copy edits from the key's targets, plus two to dismiss later
    let pathN = 10;
    const edit = async (t, elementPath) => {
      const v = await latest(t.flow);
      const scr = v.manifest.screens.find((s) => s.id === t.screen);
      const device = scr?.devices?.desktop ? "desktop" : "mobile";
      const r = await api.post(client, `${flowOf(t.flow)}/text-edits`, { screen: { id: t.screen, device }, elementPath, originalText: t.text, originalHash: textHash(t.text), newText: t.newText, flowVersion: v.number });
      A.edits.posted++;
      A.edits.ids[t.name] = r.json?.id ?? null;
      return r;
    };
    // the superseded edit goes first, then the one that replaces it (same element path): the portal
    // must report `replaced` on the second, and the second is the one that lands in release 2
    const paths = {};
    const pathFor = (name) => (paths[name] ??= `b/1/${pathN++}`);
    const ordered = [...R.A.editTargets].sort((a, b) => (a.supersededBy ? 0 : 1) - (b.supersededBy ? 0 : 1));
    const replacers = new Set(R.A.editTargets.filter((t) => t.supersededBy).map((t) => t.supersededBy));
    for (const t of ordered) {
      const p = pathFor(t.supersededBy ?? t.name);
      const r = await edit(t, p);
      if (replacers.has(t.name)) A.edits.supersedeReplaced = !!r.json?.replaced;
      if (r.status !== 201) note(`edit ${t.name} refused: ${r.status} ${r.error}`);
    }
    await edit({ name: "dismiss1", flow: "sign-up", screen: "03-Welcome-Default", text: "Back to events", newText: "Back to shows" }, "b/1/90");
    await edit({ name: "dismiss2", flow: "wallet", screen: "01-Balance-Default", text: "Continue", newText: "Next" }, "b/1/91");
    note(`round A: ${A.edits.posted} copy edits, supersede reported ${A.edits.supersedeReplaced}`);
    // waivers: the first three missing states the portal reports, by staff; one attempt by the client
    let waived = 0;
    const waivedList = [];
    for (const f of key.flows) {
      if (waived >= 3) break;
      const grid = (await api.get(designer, `${flowOf(f.slug)}/states`)).json;
      for (const m of grid?.missing ?? []) {
        if (waived >= 3) break;
        const r = await api.post(designer, `${flowOf(f.slug)}/waivers`, { step: m.step, state: m.state, reason: `pilot scope: ${m.state.toLowerCase()} does not occur in ${f.slug}` });
        if (r.status === 200) {
          waived++;
          waivedList.push({ flow: f.slug, step: m.step, state: m.state });
        }
      }
    }
    const cw = await api.post(client, `${flowOf("request-a-refund")}/waivers`, { step: "02", state: "Error", reason: "client says so" });
    A.waivers = { posted: waived, list: waivedList, refusedForClient: cw.status === 403 };
    // the too-large screen (reports/02/Default): the grid no longer lists it as missing, and it
    // cannot be waived like an ordinary missing state
    const reportsGrid = (await api.get(designer, `${flowOf("reports")}/states`)).json;
    const reportsStep02 = reportsGrid?.steps?.find((s) => s.n === "02");
    const tooLargeWaiver = await api.post(designer, `${flowOf("reports")}/waivers`, { step: "02", state: "Default", reason: "trying to waive a too-large state" });
    A.tooLarge = { flow: "reports", step: "02", gridStatus: reportsStep02?.states?.Default?.status ?? null, waiverStatus: tooLargeWaiver.status };
    // structure edits from the portal side (a client cannot; staff can): step titles and an entry point
    const st1 = await api.put(designer, `${flowOf("sign-up")}/structure`, { waivers: {}, stepTitles: { "01": "Your email" }, entryPoints: [{ from: "Landing page", to: "01-Email" }] });
    const st2 = await api.put(designer, `${flowOf("wallet")}/structure`, { waivers: {}, stepTitles: { "01": "Your balance" } });
    const stc = await api.put(client, `${flowOf("sign-up")}/structure`, { waivers: {}, stepTitles: { "01": "Nope" } });
    A.structure = { stepTitles: 2, entryPoints: 1, status: [st1.status, st2.status], clientRefused: stc.status === 403 };
    // the journey reordered
    const all = (await api.get(designer, `/projects/${PROJECT}/flows`)).json.flows.map((f) => f.id);
    const ro = await api.put(designer, `/projects/${PROJECT}/flows/order`, { ids: [...all].reverse() });
    A.reorder = ro.status === 200;
    // two threads to the agent, one resolved by staff and reopened by the client
    for (const t of firstThreads.slice(0, 2)) {
      const r = await api.patch(designer, `${flowOf(t.flow)}/comments/${t.id}`, { sentToAgent: true });
      if (r.status === 200) A.agentThreads.push({ flow: t.flow, id: t.id });
    }
    const t3 = firstThreads[2];
    if (t3) {
      const res = await api.post(designer, `${flowOf(t3.flow)}/comments/${t3.id}/resolve`, {});
      const reo = await api.post(client, `${flowOf(t3.flow)}/comments/${t3.id}/reopen`, {});
      const open = (await api.get(designer, `${flowOf(t3.flow)}/comments?status=open`)).json?.threads?.some((x) => x.id === t3.id);
      A.reopened = { resolveStatus: res.status, reopenStatus: reo.status, statusAfter: open ? "open" : "resolved" };
    }
    note(`round A: waivers ${waived}, structure ${A.structure.status.join("/")}, reorder ${A.reorder}, agent threads ${A.agentThreads.length}, reopen ${A.reopened.statusAfter}`);
  });

  // ---- release 2: feedback in, then the designer reshapes the product ----
  await timed("release2", async () => {
    const r2 = { editsLanded: {}, applied: 0, needsManual: 0, dismissed: 0, replies: 0 };
    obs.rounds.release2 = r2;
    const c = mcp();
    await tool(c, "feedback_pull", {});
    for (const name of ["dismiss1", "dismiss2"]) {
      const id = obs.rounds.A.edits.ids[name];
      const flow = name === "dismiss1" ? "sign-up" : "wallet";
      if (id) {
        const d = await c.call("edits_dismiss", { flow, id, reason: "the label matches the button on the previous screen; keeping it" });
        if (d.ok) r2.dismissed++;
      }
    }
    const flows = (await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? [];
    for (const f of flows)
      if (f.pendingEdits > 0) {
        const a = await c.call("edits_apply", { flow: f.id });
        r2.applied += a.out?.applied ?? 0;
        r2.needsManual += a.out?.needsManual?.length ?? 0;
      }
    for (const t of R.A.editTargets) if (t.filesTouched !== undefined) r2.editsLanded[t.name] = countNew(t.newText.replace(/&/g, "&amp;"));
    r2.editsLanded.dismiss1 = countNew("Back to shows");
    for (const t of obs.rounds.A.agentThreads) {
      const rp = await c.call("portal_reply", { flow: t.flow, thread: t.id, text: "Done in round 2: contrast raised on the primary action." });
      const rs = await c.call("portal_resolve", { flow: t.flow, thread: t.id });
      if (rp.ok && rs.ok) r2.replies++;
    }
    note(`release 2: applied ${r2.applied}, needsManual ${r2.needsManual}, dismissed ${r2.dismissed}, replies ${r2.replies}, landed ${JSON.stringify(r2.editsLanded)}`);
    // the designer's changes
    const fdir = (s) => join(REPO, "design", "flows", s);
    const rm = R.release2.removedStep;
    for (const f of readdirSync(fdir(rm.flow))) if (f.startsWith(`${rm.step}-`)) rmSync(join(fdir(rm.flow), f));
    const sm = JSON.parse(readFileSync(join(fdir(rm.flow), "flow.json"), "utf8"));
    sm.steps = sm.steps.filter((s) => s.n !== rm.step);
    sm.transitions = (sm.transitions ?? []).filter((t) => !t.from.startsWith(`${rm.step}-`) && !t.to.startsWith(`${rm.step}-`));
    writeFileSync(join(fdir(rm.flow), "flow.json"), JSON.stringify(sm, null, 2) + "\n");
    const add = R.release2.addedStep;
    const wdir = fdir(add.flow);
    const w = JSON.parse(readFileSync(join(wdir, "flow.json"), "utf8"));
    const n = String(w.steps.length + 1).padStart(2, "0");
    const src = readdirSync(wdir).filter((f) => /^02-/.test(f));
    const states = {};
    for (const f of src) {
      const target = f.replace(/^02-[a-z]+/, `${n}-cards`);
      writeFileSync(join(wdir, target), readFileSync(join(wdir, f), "utf8").replace(/<h1>[^<]*<\/h1>/, `<h1>Cards · ${target.split("-")[2].replace(/(-m)?\.html$/, "")}</h1>`).replace("Phone", "Card nickname"));
      const state = target.split("-")[2].replace(/(-m)?\.html$/, "").replace(/^./, (x) => x.toUpperCase());
      const dev = /-m\.html$/.test(target) ? "mobile" : "desktop";
      states[state] = { ...(typeof states[state] === "object" ? states[state] : states[state] ? { desktop: states[state] } : {}), [dev]: target };
    }
    w.steps.push({ n, id: add.id, kind: add.kind, purpose: "Saved cards", states });
    writeFileSync(join(wdir, "flow.json"), JSON.stringify(w, null, 2) + "\n");
    const rn = R.release2.renamedState;
    const bdir = fdir(rn.flow);
    const fromRe = new RegExp(rn.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    for (const f of readdirSync(bdir)) if (fromRe.test(f)) sh(`git mv ${JSON.stringify(f)} ${JSON.stringify(f.replace(fromRe, rn.to.toLowerCase()))}`, bdir);
    // the state key keeps the designer's casing, the file paths stay lower case
    const bj = readFileSync(join(bdir, "flow.json"), "utf8").replace(fromRe, (m) => (m === m.toLowerCase() ? rn.to.toLowerCase() : rn.to));
    writeFileSync(join(bdir, "flow.json"), bj);
    const foot = join(REPO, "design", "components", `${R.release2.includeOnly}.html`);
    writeFileSync(foot, readFileSync(foot, "utf8").replace("Prices in COP", "All prices in COP"));
    rmSync(fdir(R.release2.deletedFlow), { recursive: true, force: true });
    const rf = R.release2.renamedFlow;
    sh(`git mv ${rf.from} ${rf.to}`, join(REPO, "design", "flows"));
    const tj = JSON.parse(readFileSync(join(fdir(rf.to), "flow.json"), "utf8"));
    tj.slug = rf.to;
    delete tj.portal;
    writeFileSync(join(fdir(rf.to), "flow.json"), JSON.stringify(tj, null, 2) + "\n");
    commit("release 2 changes");
    const before = Object.fromEntries(flows.map((f) => [f.id, f.latestVersion]));
    const dry = await c.call("publish", { dryRun: true });
    r2.orphaningDry = dry.out?.orphaning ?? null;
    let p = await c.call("publish", { note: "Release 2: seat picking simplified, saved cards, ThreeDS rename, footer copy" });
    if (!p.ok && p.error?.code === "STALE_LOCAL") {
      await tool(c, "feedback_pull", {});
      p = await tool(c, "publish", { note: "Release 2: seat picking simplified, saved cards, ThreeDS rename, footer copy" });
    } else if (!p.ok) ctx.fail("release2 publish", p.error);
    r2.publish = { ok: p.ok, pushed: p.out?.pushed?.map((x) => x.flow) ?? [], unchanged: p.out?.unchanged?.length ?? null, skipped: p.out?.skipped?.map((x) => x.flow) ?? [], release: p.out?.release?.number ?? null, error: p.error ? `${p.error.code}: ${p.error.message?.slice(0, 200)}` : null };
    r2.portalOnly = (p.out?.portalOnly ?? []).map((x) => x.flow);
    r2.orphaning = p.out?.orphaning ?? [];
    // the designer says yes to archiving every flow the repository no longer declares
    const archived = [];
    for (const slug of r2.portalOnly) {
      const arch = await c.call("flows_archive", { flow: slug });
      if (arch.ok) archived.push(slug);
    }
    r2.archived = { asked: r2.portalOnly, ok: archived.length };
    await c.close();
    note(`release 2 published: ${r2.publish.pushed.length} pushed, ${r2.publish.unchanged} unchanged, skipped ${r2.publish.skipped.join(",") || "none"}${r2.publish.error ? "; error " + r2.publish.error : ""}; portalOnly ${r2.portalOnly.join(",") || "none"}, archived ${r2.archived.ok}/${r2.portalOnly.length}`);
    // what the portal says about it
    const det = r2.publish.release ? (await api.get(designer, `/projects/${PROJECT}/releases/${r2.publish.release}`)).json : null;
    const changes = det?.changes ?? [];
    const rows = changes.flatMap((ch) => (ch.screens ?? []).map((s) => ({ ...s, flow: ch.id })));
    const by = (flow, status) => rows.filter((r) => r.flow === flow && r.status === status).length;
    r2.diff = { added: rows.filter((r) => r.status === "added").length, removed: rows.filter((r) => r.status === "removed").length, changedSource: rows.filter((r) => r.status === "changed" && r.via === "source").length, changedInclude: rows.filter((r) => r.via === "include").length, byFlow: { seatMapRemoved: by(rm.flow, "removed"), walletAdded: by(add.flow, "added"), buyTicketsRenamed: { removed: by(rn.flow, "removed"), added: by(rn.flow, "added") } }, flowsChanged: changes.filter((c) => c.status === "changed").map((c) => c.id) };
    const orphanScreen = `${rm.step}-${rm.id}-Default`;
    const th = (await api.get(designer, `${flowOf(rm.flow)}/comments?status=all&screen=${orphanScreen}`)).json?.threads ?? [];
    const v1 = (await api.get(designer, `${flowOf(rm.flow)}/versions/1`)).json;
    r2.orphan = { threadsOnRemovedScreen: th.length, readableViaVersionsApi: !!v1?.manifest?.screens?.some((s) => s.id === orphanScreen), screen: orphanScreen };
    const after = (await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? [];
    const del = after.find((f) => f.id === R.release2.deletedFlow);
    r2.deletedFlow = { stillOnPortal: !!del, latestVersionUnchanged: del ? del.latestVersion === before[del.id] : null };
    r2.renamedFlow = { newOnPortal: after.some((f) => f.id === rf.to), oldStillOnPortal: after.some((f) => f.id === rf.from) };
    const grid = (await api.get(designer, `${flowOf("request-a-refund")}/states`)).json;
    r2.waiversSurvive = !!grid?.steps?.some((s) => Object.values(s.states ?? {}).some((x) => x.status === "waived"));
    const head = (await api.get(designer, `${flowOf("sign-up")}/head`)).json;
    r2.stepTitleKept = head?.structure?.stepTitles?.["01"] ? "portal" : "lost";
    r2.stepTitleInManifest = (await latest("sign-up"))?.manifest?.steps?.find((s) => s.n === "01")?.title ?? null;
    note(`release 2 diff: +${r2.diff.added} −${r2.diff.removed} ~${r2.diff.changedSource} source / ${r2.diff.changedInclude} include; orphan threads ${r2.orphan.threadsOnRemovedScreen}; deleted flow still on portal ${r2.deletedFlow.stillOnPortal}; renamed: new ${r2.renamedFlow.newOnPortal}, old ${r2.renamedFlow.oldStillOnPortal}; waivers survive ${r2.waiversSurvive}; step title ${r2.stepTitleKept}`);
  });

  // ---- client round B, on v2 ----
  await timed("roundB", async () => {
    const B = {};
    obs.rounds.B = B;
    const se = R.B.staleEdit;
    const v = await latest(se.flow);
    // the client made this request while looking at v1, where the text still existed
    const r = await api.post(client, `${flowOf(se.flow)}/text-edits`, { screen: { id: se.screen, device: "desktop" }, elementPath: "b/1/95", originalText: se.text, originalHash: textHash(se.text), newText: "E-mail", flowVersion: 1 });
    void v;
    const c = mcp();
    await tool(c, "feedback_pull", { flows: [se.flow] });
    const a = await c.call("edits_apply", { flow: se.flow });
    const mine = (a.out?.results ?? []).find((x) => x.id === r.json?.id);
    B.staleEdit = { posted: r.status, result: mine ? mine.result === "applied" ? "applied" : "needsManual" : "not-found", detail: mine?.result ?? null };
    if (B.staleEdit.result === "needsManual") {
      const suggested = mine?.suggest === "outdate";
      await c.call("edits_outdate", { flow: se.flow, id: r.json?.id });
      const te = (await api.get(designer, `${flowOf(se.flow)}/text-edits?status=all`)).json;
      const edit = (te?.edits ?? []).find((x) => x.id === r.json?.id);
      const openThreads = (await api.get(designer, `${flowOf(se.flow)}/comments?status=open&screen=${se.screen}`)).json;
      const threadFound = (openThreads?.threads ?? []).some((t) => /changed in version/i.test(t.text));
      B.staleEdit.outdated = { suggested, status: edit?.status ?? null, threadFound };
    }
    await c.close();
    const oc = R.B.orphanComment;
    const o = await api.post(client, `${flowOf(oc.flow)}/comments`, { text: "Still thinking about the row picker we had here.", screen: { id: oc.screen, device: "desktop" }, anchor: { x: 20, y: 20 }, flowVersion: oc.version });
    B.orphanComment = { status: o.status, code: o.code };
    const wp = R.B.waiverOnPresent;
    const w = await api.post(designer, `${flowOf(wp.flow)}/waivers`, { step: wp.step, state: wp.state, reason: "trying to waive a designed state" });
    const grid = (await api.get(designer, `${flowOf(wp.flow)}/states`)).json;
    const st = grid?.steps?.find((s) => s.n === wp.step)?.states?.[wp.state]?.status ?? null;
    B.waiverOnPresent = { status: w.status, code: w.code, stateAfter: st };
    const wallet = await latest("wallet");
    const cards = wallet?.manifest?.screens?.find((s) => s.id.includes("-Cards-"));
    if (cards) await api.post(client, `${flowOf("wallet")}/comments`, { text: "Saved cards: can I set a default?", screen: { id: cards.id, device: cards.devices.desktop ? "desktop" : "mobile" }, anchor: { x: 40, y: 40 }, flowVersion: wallet.number });
    note(`round B: stale edit → ${B.staleEdit.result} (${B.staleEdit.detail}), orphan comment ${o.status}, waiver on a present state ${w.status} (state ${st})`);
  });

  // ---- release 3: a subset, then everything; a second handoff, the first stays frozen ----
  await timed("release3", async () => {
    const r3 = {};
    obs.rounds.release3 = r3;
    const c = mcp();
    await tool(c, "feedback_pull", {});
    for (const f of (await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? []) if (f.pendingEdits > 0) await c.call("edits_apply", { flow: f.id });
    const touch = (slug, file, from, to) => {
      const p = join(REPO, "design", "flows", slug, file);
      if (existsSync(p)) writeFileSync(p, readFileSync(p, "utf8").replace(from, to));
    };
    for (const slug of R.release3.subset) {
      const f = readdirSync(join(REPO, "design", "flows", slug)).find((x) => /-default\.html$/.test(x) && !/-m\.html$/.test(x)) ?? readdirSync(join(REPO, "design", "flows", slug)).find((x) => x.endsWith(".html"));
      if (f) touch(slug, f, "<h1>", "<h1>R3 · ");
    }
    touch("payouts", "01-overview-default.html", "<h1>", "<h1>Later · ");
    commit("release 3 touches");
    const versionsBefore = Object.fromEntries(((await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? []).map((f) => [f.id, f.latestVersion]));
    const sub = await tool(c, "publish", { note: "Release 3a: five flows only", flows: R.release3.subset });
    const mid = Object.fromEntries(((await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? []).map((f) => [f.id, f.latestVersion]));
    r3.subset = { pushed: sub.out?.pushed?.map((x) => x.flow) ?? [], othersUntouched: Object.keys(versionsBefore).filter((s) => !R.release3.subset.includes(s)).every((s) => mid[s] === versionsBefore[s]), release: sub.out?.release?.number ?? null };
    const full = await tool(c, "publish", { note: "Release 3b: everything else" });
    r3.full = { pushed: full.out?.pushed?.map((x) => x.flow) ?? [], release: full.out?.release?.number ?? null };
    const h1 = (await api.get(dev, `${flowOf("buy-tickets")}/handoffs`)).json?.handoffs ?? [];
    const first = h1[h1.length - 1];
    const h = await c.call("handoff", { flow: "buy-tickets", story: "Buy tickets, third cut" });
    const h2 = (await api.get(dev, `${flowOf("buy-tickets")}/handoffs`)).json?.handoffs ?? [];
    const firstNow = first ? (await api.get(dev, `${flowOf("buy-tickets")}/handoffs/${first.id}`)).json : null;
    r3.handoffs = { v1StillV1: firstNow ? firstNow.version === first.version : null, v3Created: h.ok && h2.length === h1.length + 1, v1ScreensUrlsHaveV1: firstNow ? (firstNow.screens ?? []).every((s) => Object.values(s.devices).every((d) => d.url.includes(`/v${first.version}/`))) : null, firstVersion: first?.version ?? null, latestVersion: (await latest("buy-tickets"))?.number ?? null };
    await c.close();
    note(`release 3: subset pushed ${r3.subset.pushed.join(",")} (others untouched ${r3.subset.othersUntouched}); full pushed ${r3.full.pushed.length}; handoff v${r3.handoffs.firstVersion} frozen ${r3.handoffs.v1StillV1}, new handoff ${r3.handoffs.v3Created}`);
  });

  // ---- release 4: one force after a deliberate unpulled comment, then a publish with nothing to publish ----
  await timed("release4", async () => {
    const r4 = {};
    obs.rounds.release4 = r4;
    const v = await latest("sign-in");
    await api.post(client, `${flowOf("sign-in")}/comments`, { text: "The code field should accept paste.", flowVersion: v?.number ?? null });
    const p = join(REPO, "design", "flows", "sign-in", "01-email-default.html");
    if (existsSync(p)) writeFileSync(p, readFileSync(p, "utf8").replace("<h1>", "<h1>R4 · "));
    commit("release 4 touch");
    const c = mcp();
    const refused = await c.call("publish", { note: "Release 4 without pulling" });
    const forced = await c.call("publish", { note: "Release 4, forced on purpose", force: true });
    const d = await c.call("diagnose", { lines: 400 });
    r4.forced = { refusedFirst: !refused.ok && refused.error?.code === "STALE_LOCAL", ok: forced.ok, release: forced.out?.release?.number ?? null };
    r4.eventNamesForce = /force=1|"force":true/.test(JSON.stringify(d.out ?? {}));
    // no note, no force: nothing changed since the forced release, so this must be a plain noop
    // that never calls POST /releases — count releases before and after to prove it
    const releasesBefore = (await api.get(designer, `/projects/${PROJECT}/releases`)).json?.releases?.length ?? null;
    const d0 = await c.call("diagnose", { lines: 3000 });
    const httpBefore = (d0.out?.lines ?? []).filter((l) => l.includes('"event":"http"')).length;
    const noop = await c.call("publish", {});
    const d1 = await c.call("diagnose", { lines: 3000 });
    const httpAfter = (d1.out?.lines ?? []).filter((l) => l.includes('"event":"http"')).length;
    const releasesAfter = (await api.get(designer, `/projects/${PROJECT}/releases`)).json?.releases?.length ?? null;
    r4.noop = { ok: noop.ok, noop: noop.out?.noop === true, release: noop.out?.release ?? null, releasesBefore, releasesAfter, calls: httpAfter - httpBefore };
    await c.close();
    note(`release 4: refused first ${r4.forced.refusedFirst}, forced ${r4.forced.ok} (release ${r4.forced.release}); no-op publish → noop ${r4.noop.noop}, releases ${r4.noop.releasesBefore} → ${r4.noop.releasesAfter}`);
  });

  // ---- the developer's end: the portal's MCP server ----
  await timed("mcp", async () => {
    const devMcp = new McpHttp(PORTAL, dev);
    const lh = await devMcp.call("list_handoffs", { project: PROJECT, flow: "buy-tickets" });
    const hid = lh.result?.structuredContent?.handoffs?.[0]?.id ?? lh.result?.handoffs?.[0]?.id ?? (typeof lh.result?.content?.[0]?.text === "string" ? (JSON.parse(lh.result.content[0].text).handoffs ?? [])[0]?.id : undefined);
    const gh = await devMcp.call("get_handoff", { project: PROJECT, flow: "buy-tickets", ...(hid ? { id: hid } : {}) });
    const gg = await devMcp.call("get_states_grid", { project: PROJECT, flow: "buy-tickets" });
    const gr = await devMcp.call("get_release", { project: PROJECT, number: obs.rounds.release3?.full?.release ?? 1 });
    const status = (r) => (r.error ? `rpc:${r.error.code ?? r.error.message}` : r.isError ? "tool-error" : r.ok ? "ok" : `http:${r.status}`);
    const clientMcp = new McpHttp(PORTAL, client);
    const pf = await clientMcp.call("push_flow_version", { project: PROJECT, flow: "sign-in", bundle: { manifest: {}, files: [] }, ifMatch: 1 });
    const ws = await clientMcp.call("waive_state", { project: PROJECT, flow: "request-a-refund", step: "02", state: "Error", reason: "no" });
    const blob = JSON.stringify({ lh, gh, gg, gr, pf, ws });
    obs.mcp = { devAgent: { listHandoffs: status(lh), getHandoff: status(gh), getStatesGrid: status(gg), getRelease: status(gr) }, clientRefused: { pushFlowVersion: pf.isError || !pf.ok ? (pf.error?.code ?? "FORBIDDEN") : null, waiveState: ws.isError || !ws.ok ? (ws.error?.code ?? "FORBIDDEN") : null }, tokenLeaked: /dpat_[A-Za-z0-9_-]{8,}/.test(blob), sample: (gh.result?.content?.[0]?.text ?? "").slice(0, 200) };
    note(`mcp: dev ${JSON.stringify(obs.mcp.devAgent)}, client ${JSON.stringify(obs.mcp.clientRefused)}`);
  });

  // ---- concurrency at scale: three clones, three flows; then two clones, one flow ----
  await timed("concurrency3", async () => {
    const clones = ["a", "b", "c"].map((x) => `${REPO}-clone3-${x}`);
    const targets = ["sign-up", "wallet", "reports"];
    for (const d of clones) {
      rmSync(d, { recursive: true, force: true });
      sh(`git clone -q ${REMOTE} ${d}`, tmpdir());
    }
    clones.forEach((d, i) => {
      const dir = join(d, "design", "flows", targets[i]);
      const f = readdirSync(dir).find((x) => /-default\.html$/.test(x) && !/-m\.html$/.test(x));
      if (f) writeFileSync(join(dir, f), readFileSync(join(dir, f), "utf8").replace("<h1>", `<h1>C3-${i} · `));
    });
    const before = Object.fromEntries(((await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? []).map((f) => [f.id, f.latestVersion]));
    const cs = clones.map((d) => mcp(d));
    const rs = await Promise.all(cs.map((c, i) => c.call("publish", { note: `race ${i}`, flows: [targets[i]] })));
    await Promise.all(cs.map((c) => c.close()));
    const after = Object.fromEntries(((await api.get(designer, `/projects/${PROJECT}/flows`)).json?.flows ?? []).map((f) => [f.id, f.latestVersion]));
    const newVersions = targets.reduce((n, s) => n + ((after[s] ?? 0) - (before[s] ?? 0)), 0);
    obs.concurrency = { ...(obs.concurrency ?? {}), threeFlows: { ok: rs.filter((r) => r.ok).length, conflicts: rs.filter((r) => !r.ok).length, codes: rs.map((r) => r.error?.code ?? "ok"), newVersions } };
    for (const d of clones) rmSync(d, { recursive: true, force: true });
    note(`concurrency: three flows at once → ${obs.concurrency.threeFlows.ok} ok, ${obs.concurrency.threeFlows.conflicts} conflicts, ${newVersions} new versions`);
  });

  writeFileSync(join(REPO, "NOTES.md"), `# Marquee XL on ${PORTAL}\n\nProject \`${PROJECT}\`. What the suite did, in order:\n\n${notes.join("\n")}\n`);
  commit("notes");
  // when the renamed flow's old copy is still on the portal (not archived), the map draws its
  // cross-flow links twice; once both promo-codes and the old "team" are archived, neither
  // duplication nor the deleted flow's own links (as a source or a target) show up any more
  const oldFlow = key.flows.find((f) => f.slug === R.release2.renamedFlow.from);
  const deletedSlug = R.release2.deletedFlow;
  const bothArchived = obs.rounds.release2?.deletedFlow?.stillOnPortal === false && obs.rounds.release2?.renamedFlow?.oldStillOnPortal === false;
  const extraEdges = !bothArchived && obs.rounds.release2?.renamedFlow?.oldStillOnPortal && obs.rounds.release2?.renamedFlow?.newOnPortal ? (oldFlow?.next ?? []).length : 0;
  const expectedBase = bothArchived
    ? key.flows.reduce((n, f) => (f.slug === deletedSlug ? n : n + (f.next ?? []).filter((l) => l.flow !== deletedSlug).length), 0)
    : obs.journey?.expected;
  const ui = { journeyExpected: expectedBase != null ? expectedBase + extraEdges : null, orphan: obs.rounds.release2?.orphan ? { flow: R.release2.removedStep.flow, screen: obs.rounds.release2.orphan.screen, version: 1, text: "row picker" } : null, release2: obs.rounds.release2?.publish?.release ?? null, sheets: (key.components?.files ?? []).length };
  return ui;
}
