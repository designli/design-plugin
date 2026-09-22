// Turns an answer key and a run's observations into the scorecard: every metric a number with
// a target, a pass flag and the failing items, plus the delta against the previous committed
// run for the same tier and portal.
//   node score.mjs <results dir>       re-scores a run from its answer-key.json + observations.json
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const ratio = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : null);

export function score(key, obs, { tier = "tier1", results = null } = {}) {
  const M = {}; // area → name → { value, target, op, pass, items }
  const add = (area, name, value, target, { op = ">=", items = [], unit = "" } = {}) => {
    const pass =
      value === null || value === undefined
        ? false
        : op === ">="
          ? value >= target
          : op === "<="
            ? value <= target
            : op === "=="
              ? value === target
              : op === "rec"
                ? true
                : false;
    (M[area] ??= {})[name] = { value, target, op, pass, items: items.slice(0, 12), unit };
  };
  const flows = key.flows;
  const nonWeird = (f) => f.steps.filter((s) => !s.weird);
  const proposed = (slug) => obs.adopt?.proposed?.find((p) => p.slug === slug);

  // ---- adopt ----
  {
    let kindOk = 0, kindN = 0, stOk = 0, stN = 0, devOk = 0, entryOk = 0, trOk = 0, trN = 0;
    const kindItems = [], stItems = [], devItems = [], trItems = [];
    for (const f of flows) {
      const p = proposed(f.slug);
      if (!p) {
        devItems.push(`${f.slug}: not proposed`);
        continue;
      }
      if (setEq(p.devices ?? [], f.devices)) devOk++;
      else devItems.push(`${f.slug}: proposed ${p.devices?.join("+")} expected ${f.devices.join("+")}`);
      if (p.entry?.includes(f.entry)) entryOk++;
      for (const s of nonWeird(f)) {
        const ps = p.steps.find((x) => x.n === s.n);
        kindN++;
        stN++;
        if (ps?.kind === s.kind) kindOk++;
        else kindItems.push(`${f.slug} ${s.n}-${s.id}: guessed ${ps?.kind ?? "none"} expected ${s.kind}`);
        if (ps && setEq(ps.states, s.states)) stOk++;
        else stItems.push(`${f.slug} ${s.n}-${s.id}: ${ps ? ps.states.join(",") : "missing"} vs ${s.states.join(",")}`);
      }
      for (const t of f.transitions) {
        trN++;
        if (p.transitions?.some((x) => x.from === t.from && x.to === t.to)) trOk++;
        else trItems.push(`${f.slug}: ${t.from} → ${t.to} (${t.on})`);
      }
    }
    add("adopt", "kindAccuracy", ratio(kindOk, kindN), 0.9, { items: kindItems });
    add("adopt", "stateCoverage", ratio(stOk, stN), 1, { items: stItems });
    add("adopt", "deviceDetection", ratio(devOk, flows.length), 1, { items: devItems });
    add("adopt", "entryRecall", ratio(entryOk, flows.length), 1);
    add("adopt", "transitionRecall", ratio(trOk, trN), 0.9, { items: trItems });
    // links into other flows become journey connectors
    const cross = flows.flatMap((f) => f.crossFlow.map((c) => ({ ...c, slug: f.slug })));
    const crossOk = cross.filter((c) => (proposed(c.slug)?.next ?? []).some((n) => n.flow === c.to));
    if (cross.length) add("adopt", "journeyLinksRecall", ratio(crossOk.length, cross.length), 1, { items: cross.filter((c) => !crossOk.includes(c)).map((c) => `${c.slug} → ${c.to} (${c.label})`) });
    const q = obs.adopt?.questions ?? [];
    add("adopt", "questionsPerFlow", ratio(q.length, flows.length), 6, { op: "<=", unit: "q" });
    // avoidable: a title (from the folder), an entry point the proposal already got right, a kind the proposal already got right
    let avoidable = 0;
    for (const x of q) {
      const f = flows.find((y) => y.slug === x.flow);
      const p = proposed(x.flow);
      if (!f || !p) continue;
      if (x.field === "title") avoidable++;
      else if (x.field === "entryPoints" && p.entry?.includes(f.entry)) avoidable++;
      else if (/^steps\.(\d+)\.kind$/.test(x.field)) {
        const n = x.field.match(/^steps\.(\d+)\.kind$/)[1];
        const s = f.steps.find((y) => y.n === n), ps = p.steps.find((y) => y.n === n);
        if (s && ps && s.kind === ps.kind) avoidable++;
      }
    }
    add("adopt", "avoidableQuestions", avoidable, 0, { op: "<=", unit: "q" });
    const writes = obs.adopt?.writes ?? [];
    add("adopt", "flowsWritten", ratio(writes.filter((w) => w.ok).length, flows.length), 1, { items: writes.filter((w) => !w.ok).map((w) => `${w.slug}: ${w.error?.message ?? w.error?.code}`) });
    const weird = flows.flatMap((f) => f.steps.filter((s) => s.weird).map((s) => ({ f, s })));
    add("adopt", "oddNamesHandled", weird.length ? ratio(weird.filter(({ f, s }) => proposed(f.slug)?.steps.find((x) => x.n === s.n)?.id && /^[A-Z][A-Za-z0-9]*$/.test(proposed(f.slug).steps.find((x) => x.n === s.n).id) && !/X/.test(proposed(f.slug).steps.find((x) => x.n === s.n).id.replace(/^Pr/, ""))).length, weird.length) : 1, 1, { items: weird.map(({ f, s }) => `${f.slug} ${s.n}: "${s.id}" → ${proposed(f.slug)?.steps.find((x) => x.n === s.n)?.id ?? "?"}`) });
  }
  // ---- gaps ----
  {
    const planted = flows.flatMap((f) => f.gaps.map((g) => ({ ...g, flow: f.slug })));
    // the plugin reports per file; the key plants per step, so found gaps collapse to (flow, kind, step)
    const seen = new Set();
    const found = (obs.adopt?.gaps ?? []).filter((x) => {
      const k = `${x.flow}|${x.kind}|${String(x.where ?? "").slice(0, 2)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const hit = (g) => found.some((x) => x.flow === g.flow && x.kind === g.kind && String(x.where ?? "").startsWith(g.where.split(" ")[0]));
    const missed = planted.filter((g) => !hit(g));
    add("gaps", "plantedRecall", ratio(planted.length - missed.length, planted.length), 1, { items: missed.map((g) => `${g.flow} ${g.kind} ${g.where}`) });
    const isPlanted = (x) => planted.some((g) => g.flow === x.flow && g.kind === x.kind && String(x.where ?? "").startsWith(g.where.split(" ")[0]));
    const extra = found.filter((x) => !isPlanted(x));
    add("gaps", "precision", ratio(found.length - extra.length, found.length), 0.9, { items: extra.map((x) => `${x.flow} ${x.kind} ${x.where ?? ""}: ${x.message ?? ""}`) });
  }
  // ---- publish ----
  if (obs.publish1) {
    const p1 = obs.publish1 ?? {};
    add("publish", "flowsPushed", ratio(p1.pushed?.length ?? 0, flows.length), 1, { items: p1.error ? [`${p1.error.code}: ${p1.error.message}`] : [] });
    add("publish", "brokenFlowIsolated", p1.brokenIncludeBlockedAll ? 0 : 1, 1, { op: "==", items: p1.brokenIncludeBlockedAll ? ["one flow with a broken include blocked the release of all ten (first attempt pushed 0)"] : p1.skippedFirst ? [`skipped and reported: ${p1.skippedFirst.join(", ")}`] : [] });
    add("publish", "secondsPerFlow", p1.ms ? Math.round(p1.ms / flows.length / 100) / 10 : null, 10, { op: "<=", unit: "s" });
    add("publish", "http429", p1.http429 ?? null, 0, { op: "<=" });
    const pf = obs.portal1?.flows ?? [];
    const devItems = [], scrItems = [];
    let devOk = 0, scrOk = 0;
    for (const f of flows) {
      const x = pf.find((y) => y.slug === f.slug);
      if (!x || x.error) {
        devItems.push(`${f.slug}: not on the portal`);
        continue;
      }
      const wantMobile = f.devices.includes("mobile"), wantDesktop = f.devices.includes("desktop");
      const ok = x.devices.includes("mobile") === wantMobile && (wantDesktop ? x.desktopScreens > 0 : x.desktopScreens === 0);
      if (ok) devOk++;
      else devItems.push(`${f.slug}: manifest devices ${x.devices.join("+")}, desktop screens ${x.desktopScreens}, mobile ${x.mobileScreens}; expected ${f.devices.join("+")}`);
      const states = f.steps.reduce((n, s) => n + s.states.length, 0) + (["buy-tickets"].includes(f.slug) ? 1 : 0);
      if (x.screens === states) scrOk++;
      else scrItems.push(`${f.slug}: ${x.screens} screens on the portal, ${states} expected`);
    }
    add("publish", "mobileFlags", ratio(devOk, flows.length), 1, { items: devItems });
    add("publish", "screensMatch", ratio(scrOk, flows.length), 1, { items: scrItems });
    add("publish", "boardOverlaps", pf.reduce((n, x) => n + (x.overlaps ?? 0), 0), 0, { op: "<=", items: pf.filter((x) => x.overlaps).map((x) => `${x.slug}: ${x.overlaps}`) });
    const sheets = obs.portal1?.components?.sheets ?? [];
    add("publish", "componentSheets", ratio(sheets.length, key.components.files.length), 1, { items: sheets.length ? [] : [obs.portal1?.components?.error ?? "no components"] });
    add("publish", "sheetsStyled", ratio(sheets.filter((s) => s.styled).length, sheets.length), 1, { items: sheets.filter((s) => !s.styled).map((s) => s.id) });
    const nested = obs.portal1?.nested;
    if (nested) add("publish", "nestedIncludesInlined", nested.unresolvedImports === 0 && nested.logo ? 1 : 0, 1, { op: "==", items: !(nested.unresolvedImports === 0 && nested.logo) ? [`${nested.unresolvedImports} import tag(s) left, logo ${nested.logo ? "present" : "missing"}`] : [] });
    if (obs.portal1?.caching) {
      const c = obs.portal1.caching;
      add("publish", "caching", [c.etag, c.notModified, c.bridge].filter(Boolean).length, 3, { op: "==", items: Object.entries(c).filter(([, v]) => !v).map(([k]) => k) });
    }
    if (obs.stress) {
      const st = obs.stress;
      const sf = st["stress-files"], sb = st["stress-bytes"];
      add("publish", "limitsRefused", [sf, sb].filter((x) => x && !x.ok).length, 2, { op: "==", items: [sf && sf.ok ? "450 files accepted" : null, sb && sb.ok ? "21 MB accepted" : null, ...(st.leakedFlows?.length ? [`leaked: ${st.leakedFlows.join(",")}`] : [])].filter(Boolean) });
      add("publish", "limitsExplained", [sf, sb].filter((x) => x && !x.ok && x.hasFix).length, 2, { op: "==", items: [sf, sb].filter((x) => x && !x.hasFix).map((x) => `${x.code}: ${x.message}`) });
    }
  }
  // ---- feedback ----
  {
    const fb = obs.feedback ?? {};
    const fw = fb.filesWith ?? {};
    const items = [];
    const expectAll = { "Help center": 1, "Your email": key.edits.screen.filesTouched, Email: 0, "Confirm &amp; pay": key.edits.mobileOnly.filesTouched, "Back to shows": 0 };
    const expect = Object.fromEntries(Object.entries(expectAll).filter(([t]) => t in fw));
    let ok = 0;
    for (const [t, n] of Object.entries(expect)) {
      if (fw[t] === n) ok++;
      else items.push(`"${t}": ${fw[t]} files, expected ${n}`);
    }
    add("feedback", "editsLanded", ratio(ok, Object.keys(expect).length), 1, { items });
    add("feedback", "includeEditedOnce", fb.includeEditedOnce ? 1 : 0, 1, { op: "==" });
    if (fb.digest) add("feedback", "digestAgentFirst", fb.digest.firstIsAgent ? 1 : 0, 1, { op: "==", items: fb.digest.firstIsAgent ? [] : [fb.digest.raw?.slice(0, 200) ?? "no digest"] });
    if (fb.dismiss || fb.replies) add("feedback", "dismissReplyResolve", [fb.dismiss?.ok, fb.replies?.reply, fb.replies?.resolve].filter(Boolean).length, 3, { op: "==", items: [fb.dismiss?.error, fb.replies?.error].filter(Boolean).map((e) => e.message ?? e.code) });
    const n = obs.clientRound?.nasty;
    if (n) add("feedback", "supersedeReported", n.edits?.supersede?.replaced ? 1 : 0, 1, { op: "==" });
  }
  // ---- safety ----
  {
    const n = obs.clientRound?.nasty;
    if (n) {
    const checks = { clientWaiver403: n.clientWaiver?.status === 403, clientPush403: n.clientPush?.status === 403, clientFlag403: n.clientFlag?.status === 403, staffWaiver200: n.staffWaiver?.status === 200, agentFlag200: n.sentToAgent?.status === 200, longComment: n.longComment?.at4000 === 201 && n.longComment?.at4001 === 422 };
    add("safety", "scopeEnforced", ratio(Object.values(checks).filter(Boolean).length, Object.keys(checks).length), 1, { items: Object.entries(checks).filter(([, v]) => !v).map(([k]) => `${k}: ${JSON.stringify(n[k.replace(/\d+$/, "")] ?? n[k] ?? null)}`) });
    }
    if (obs.publish2?.stale) {
      const s2 = obs.publish2.stale;
      add("safety", "staleRefused", s2.refused && s2.code === "STALE_LOCAL" && s2.mentionsPull ? 1 : 0, 1, { op: "==", items: s2.refused ? [] : ["publish went through without a pull"] });
      add("safety", "forceWorks", obs.publish2?.force?.ok ? 1 : 0, 1, { op: "==" });
    }
    const blob = JSON.stringify(obs);
    add("safety", "tokensLeaked", (blob.match(/dpat_[A-Za-z0-9_-]{8,}|ddev_[A-Za-z0-9_-]{8,}/g) || []).length, 0, { op: "<=" });
    if (obs.setup) add("safety", "mcpJsonSafe", obs.setup.envExpansion && !obs.setup.literalToken ? 1 : 0, 1, { op: "==" });
  }
  // ---- release diff ----
  if (obs.publish2?.diff) {
    const d = obs.publish2.diff;
    // source rows: the touched payouts screen plus what the applied copy edits changed
    // (sign-up step 01, 4 states × 2 devices, which covers the two touched default files; transfer Confirm Default mobile)
    // the touched payouts screen (the touched sign-up defaults are among the edited files) plus every source file a copy edit landed in
    const expectedSource = 1 + Object.values(obs.feedback?.apply ?? {}).reduce((n, a) => n + (a.sourceFiles ?? 0), 0);
    add("release", "diffSourceRows", d.viaSource ?? null, expectedSource, { op: "==", items: d.rows === 0 ? ["no diff rows"] : (d.sample ?? []).map((r) => `${r.flow} ${r.id} ${r.device}`) });
    add("release", "diffIncludeRows", d.viaInclude ?? 0, 1, { op: ">=" });
    add("release", "includeOnlyRows", d.viaInclude ?? 0, 100, { op: ">=", items: [`${(d.flowsChanged ?? []).length} flows changed, ${d.viaInclude ?? 0} rows via include`] });
    add("release", "staleAfterOwnReply", obs.publish2?.staleAfterOwnReply ? 1 : 0, 0, { op: "<=", items: obs.publish2?.staleAfterOwnReply ? ["the plugin's own reply/resolve made the flow count as unpulled"] : [] });
  }
  // ---- concurrency ----
  if (obs.concurrency) add("reliability", "concurrentPublishClean", obs.concurrency.clean ? 1 : 0, 1, { op: "==", items: [`A ${obs.concurrency.a.ok ? "ok" : obs.concurrency.a.code}, B ${obs.concurrency.b.ok ? "ok" : obs.concurrency.b.code}, new versions ${obs.concurrency.newVersions}`] });
  // ---- handoff ----
  if (obs.handoff) {
    const hs = obs.handoff.flows ?? [];
    add("handoff", "created", ratio(hs.filter((h) => h.ok).length, hs.length), 1, { items: hs.filter((h) => !h.ok).map((h) => `${h.slug}: ${h.error}`) });
    const done = hs.filter((h) => h.spec);
    if (done.length) {
    add("handoff", "stepsInSpec", ratio(done.reduce((n, h) => n + h.spec.steps, 0), done.reduce((n, h) => n + h.spec.of, 0)), 1, { items: done.filter((h) => h.spec.steps < h.spec.of).map((h) => `${h.slug}: ${h.spec.steps}/${h.spec.of}`) });
    add("handoff", "transitionsInSpec", ratio(done.reduce((n, h) => n + h.spec.transitions, 0), done.reduce((n, h) => n + h.spec.of_t, 0)), 0.9);
    add("handoff", "copyInSpec", ratio(done.filter((h) => h.spec.copyHits > 0).length, done.length), 1, { items: done.filter((h) => !h.spec.copyHits).map((h) => h.slug) });
    const rf = done.find((h) => h.slug === "request-a-refund");
    if (rf) add("handoff", "waiverInSpec", rf.spec.waived ? 1 : 0, 1, { op: "==" });
    add("handoff", "devAgentReads", ratio(done.filter((h) => h.spec.devGet).length, done.length), 1);
    }
  }
  // ---- round trip ----
  if (obs.lostRepo) {
    add("roundTrip", "unchangedAfterRebuild", ratio(obs.lostRepo.unchanged, obs.lostRepo.of), 1, { items: obs.lostRepo.dry?.map((s, i) => `${i}: ${s}`).filter((x) => !x.endsWith("unchanged")) ?? [] });
    add("roundTrip", "filesIdentical", obs.lostRepo.differing?.length ?? null, 0, { op: "<=", items: obs.lostRepo.differing ?? [] });
  }
  // ---- reliability ----
  {
    const r = obs.reliability ?? {};
    // a notice is due only when the portal announces something newer than this plugin
    const cmp = (a, b) => {
      const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d) return d < 0 ? -1 : 1;
      }
      return 0;
    };
    const shouldNotice = Boolean(obs.meta.portalPluginLatest && cmp(obs.meta.plugin, obs.meta.portalPluginLatest) < 0);
    add("reliability", "updateNoticeCorrect", shouldNotice === Boolean(r.status?.pluginNotice) ? 1 : 0, 1, { op: "==", items: [r.status?.pluginNotice ?? "no notice"] });
    if (r.diagnose && tier === "tier1") add("reliability", "diagnoseByRunId", r.diagnose.failedWithRun && (r.diagnose.linesForRun ?? 0) > 0 ? 1 : 0, 1, { op: "==" });
    if (r.expiredHandle && tier === "tier1") add("reliability", "expiredHandleClear", r.expiredHandle.code === "NOT_FOUND" ? 1 : 0, 1, { op: "==" });
    const toolErrors = obs.errors.filter((e) => e.code && !/^(RPC|TOOL)$/.test(e.code));
    add("reliability", "failuresWithRunId", ratio(toolErrors.filter((e) => e.run).length, toolErrors.length) ?? 1, 1, { items: toolErrors.filter((e) => !e.run).map((e) => `${e.step}: ${e.code}`) });
    const unexpected = obs.errors.filter((e) => !/^(handoff|signin_poll)$/.test(e.step) && !/no-such-flow|signin_999|include Nope not found|neither designed nor waived/.test(e.message));
    add("reliability", "unexpectedErrors", unexpected.length, 0, { op: "<=", items: unexpected.map((e) => `${e.step}: ${e.code ?? ""} ${e.message.slice(0, 140)}`) });
    add("reliability", "apiCalls", r.api?.calls ?? null, 0, { op: "rec" });
  }

  // ---- ui (tier 1, when Playwright was available) ----
  if (obs.ui && !obs.ui.skipped) {
    const u = obs.ui, c = u.checks ?? {};
    // the bad-code page asks the API for a code that does not exist: that 404 is the point of the page
    const pages = Object.entries(u.pages ?? {}).filter(([n]) => n !== "device-bad-code");
    add("ui", "consoleErrors", pages.reduce((n, [, p]) => n + (p.consoleErrors?.length ?? 0), 0), 0, { op: "<=", items: pages.flatMap(([n, p]) => (p.consoleErrors ?? []).map((e) => `${n}: ${e}`)) });
    const flowChecks = Object.entries(c).filter(([k]) => k.startsWith("flow."));
    add("ui", "boardsRendered", ratio(flowChecks.filter(([, v]) => v.boards > 0).length, flowChecks.length), 1, { items: flowChecks.filter(([, v]) => !v.boards).map(([k]) => k) });
    add("ui", "noUnescapedScript", flowChecks.some(([, v]) => v.unescapedScript) ? 0 : 1, 1, { op: "==" });
    const toggle = { "flow.buy-tickets": false, "flow.transfer-a-ticket": false, "flow.create-an-event": true, "flow.account-settings": false };
    const toggleItems = Object.entries(toggle).filter(([k, want]) => c[k] && c[k].mobileDisabled !== null && c[k].mobileDisabled !== want).map(([k, want]) => `${k}: mobile ${c[k].mobileDisabled ? "disabled" : "enabled"}, expected ${want ? "disabled" : "enabled"}`);
    add("ui", "mobileToggleState", ratio(Object.keys(toggle).length - toggleItems.length, Object.keys(toggle).length), 1, { items: toggleItems });
    // immutable screens never revalidate (the browser serves them from cache without a request), so this is a record, not a gate
    add("ui", "reloadRequests", flowChecks.reduce((n, [, v]) => n + (v.reload200 ?? 0) + (v.reload304 ?? 0), 0), 0, { op: "rec", items: flowChecks.map(([k, v]) => `${k}: ${v.reload304 ?? 0}×304 ${v.reload200 ?? 0}×200`) });
    add("ui", "clientSeesNoStaffControls", c.client && !c.client.skipped && !c.client.adminLink && !c.client.sendToAgent ? 1 : 0, 1, { op: "==", items: c.client ? [JSON.stringify({ adminLink: c.client.adminLink, sendToAgent: c.client.sendToAgent, skipped: c.client.skipped ?? null, account: obs.clientAccount ?? null })] : ["no client view"] });
    add("ui", "docsServed", c.docs === 200 ? 1 : 0, 1, { op: "==" });
    add("ui", "deviceBadCodeExplained", c.deviceBadCode ? 1 : 0, 1, { op: "==" });
    add("ui", "componentSheetsShown", c.componentSheets ?? null, key.components.files.length, { op: ">=" });
  }
  // ---- agent (tier 2) ----
  if (obs.agent) {
    const a = obs.agent;
    add("agent", "questionsListedPerFlow", ratio(a.totals?.questions ?? 0, flows.length), 3, { op: "<=", unit: "q", items: a.steps.flatMap((s) => s.questions.slice(0, 4)) });
    add("agent", "forcedPublish", a.totals?.forced ? 1 : 0, 0, { op: "<=" });
    add("agent", "tokenInTranscript", a.totals?.tokenLeaked ? 1 : 0, 0, { op: "<=" });
    add("agent", "staleAttemptRefused", a.staleAttempt && !a.staleAttempt.forced && !a.staleAttempt.publishedAnyway ? 1 : 0, 1, { op: "==", items: a.staleAttempt ? [JSON.stringify(a.staleAttempt)] : ["no stale attempt"] });
    add("agent", "stepsCompleted", ratio(a.steps.filter((s) => s.code === 0).length, a.steps.length), 1, { items: a.steps.filter((s) => s.code !== 0).map((s) => `${s.name}: exit ${s.code} ${s.stderr}`) });
    add("agent", "turnsTotal", a.totals?.turns ?? null, 0, { op: "rec" });
    add("agent", "costUsd", a.totals?.costUsd ?? null, 0, { op: "rec" });
  }
  const all = Object.entries(M).flatMap(([area, ms]) => Object.entries(ms).map(([name, m]) => ({ area, name, ...m })));
  const scored = all.filter((m) => m.op !== "rec");
  const summary = { passed: scored.filter((m) => m.pass).length, total: scored.length, timings: obs.timings };
  const previous = results ? previousRun(results, tier) : null;
  const card = { tier, portal: obs.meta.portal, plugin: obs.meta.plugin, portalVersion: obs.meta.portalVersion, stamp: basename(results ?? ""), summary, metrics: M, previous: previous?.stamp ?? null };
  card.markdown = render(card, previous);
  return card;
}

function previousRun(results, tier) {
  const dir = resolve(results, "..");
  const mine = basename(results);
  const host = mine.split(`-${tier}-`)[1];
  const runs = readdirSync(dir).filter((d) => d !== mine && d.includes(`-${tier}-`) && d.endsWith(host) && existsSync(join(dir, d, "scorecard.json"))).sort();
  const last = runs[runs.length - 1];
  return last ? { stamp: last, ...JSON.parse(readFileSync(join(dir, last, "scorecard.json"), "utf8")) } : null;
}
function render(card, prev) {
  const rows = [];
  for (const [area, ms] of Object.entries(card.metrics))
    for (const [name, m] of Object.entries(ms)) {
      const p = prev?.metrics?.[area]?.[name];
      const delta = p && typeof p.value === "number" && typeof m.value === "number" ? m.value - p.value : null;
      const v = m.value === null ? "n/a" : `${m.value}${m.unit}`;
      rows.push(`| ${area} | ${name} | ${v} | ${m.op === "rec" ? "recorded" : `${m.op} ${m.target}${m.unit}`} | ${m.op === "rec" ? "" : m.pass ? "pass" : "FAIL"} | ${delta === null ? "" : (delta > 0 ? "+" : "") + Math.round(delta * 1000) / 1000} |`);
    }
  const fails = [];
  for (const [area, ms] of Object.entries(card.metrics)) for (const [name, m] of Object.entries(ms)) if (!m.pass && m.op !== "rec" && m.items?.length) fails.push(`- **${area}.${name}**: ${m.items.join("; ")}`);
  const t = card.summary.timings ?? {};
  return `# Scorecard ${card.stamp}\n\n${card.tier} · portal ${card.portal} (${card.portalVersion ?? "?"}) · plugin ${card.plugin} · ${card.summary.passed}/${card.summary.total} pass${prev ? ` · vs ${prev.stamp}` : ""}\n\n| Area | Metric | Value | Target | Result | Δ |\n| --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n## Failing items\n\n${fails.join("\n") || "none"}\n\n## Timings (s)\n\n${Object.entries(t).map(([k, v]) => `${k} ${Math.round(v / 100) / 10}`).join(" · ")}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolve(process.argv[2] || ".");
  const key = JSON.parse(readFileSync(join(dir, "answer-key.json"), "utf8"));
  const obs = JSON.parse(readFileSync(join(dir, "observations.json"), "utf8"));
  const tier = basename(dir).includes("-tier2-") ? "tier2" : "tier1";
  const card = score(key, obs, { tier, results: dir });
  writeFileSync(join(dir, "scorecard.json"), JSON.stringify(card, null, 2));
  writeFileSync(join(dir, "scorecard.md"), card.markdown);
  console.log(card.markdown);
}
