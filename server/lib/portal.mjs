// The portal client and the workflows built on it: publish (bundle → head → push → release),
// feedback (pull, digest, apply copy edits), adopt from the portal, hand off. One HTTP contract,
// the same scoped token the cloud MCP server uses. Nothing here prints; callers format.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { PLUGIN_VERSION, DEFAULT_PORTAL, normalizeUrl, tokenFor, readLibrary,
  headerListeners,
} from "./setup.mjs";
import {
  scanFile,
  componentFile,
  readPrototype,
  readProduct,
  isDc,
  componentId,
} from "./proto.mjs";
import {
  listFlows,
  readFlow,
  writeFlow,
  resolveStates,
  resolveFlowDir,
  flowDirOf,
  gapsOf,
  BLOCKING,
} from "./flows.mjs";
import { buildFlowBundle, buildComponentsBundle } from "./bundle.mjs";
import { log, runId } from "./log.mjs";

export class PortalError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details ?? null;
  }
}
const codeOf = (status, json) =>
  json?.error?.code ||
  (status === 401
    ? "UNAUTHORIZED"
    : status === 403
      ? "FORBIDDEN"
      : status === 404
        ? "NOT_FOUND"
        : status === 409
          ? "CONFLICT"
          : status === 429
            ? "RATE_LIMITED"
            : "PORTAL");

/** What the portal last said about the plugin (from the X-Designli-Plugin-* answer headers). */
const portalMeta = { latest: null, minimum: null };
export const getPortalMeta = () => ({ ...portalMeta });
headerListeners.push((h) => notePortalMeta(h));
export function notePortalMeta(headers) {
  const latest = headers.get("x-designli-plugin-latest");
  const minimum = headers.get("x-designli-plugin-min");
  if (latest) portalMeta.latest = latest;
  if (minimum) portalMeta.minimum = minimum;
}
/** Resolves url, token and project id from the environment, the repo and explicit overrides. */
export function context(project, { url, projectId } = {}) {
  const lib = readLibrary(project) || {};
  const u = normalizeUrl(url || process.env.DESIGNLI_PORTAL_URL || lib.publish?.portal?.url || "");
  if (!u)
    throw new PortalError(
      "SETUP",
      "no portal url: run setup (design/library.json.publish.portal.url) or set DESIGNLI_PORTAL_URL",
    );
  const { token, source } = tokenFor(u);
  if (!token)
    throw new PortalError(
      "PORTAL_TOKEN",
      `no token for ${u}: sign in with signin_start / signin_poll (approve in the browser), or export DESIGNLI_PORTAL_TOKEN before starting the agent`,
    );
  const p = projectId || lib.publish?.portal?.projectId;
  return { url: u, token, tokenSource: source, projectId: p, project };
}
const needProject = (ctx) => {
  if (!ctx.projectId)
    throw new PortalError(
      "SETUP",
      "no project id: run setup (design/library.json.publish.portal.projectId)",
    );
  return ctx.projectId;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** One HTTP call; a read (GET) is retried once on a network drop or a 429, a write never. */
export async function call(ctx, method, path, body, headers = {}, gzip = false) {
  const h = {
    "x-designli-client": `designli-design/${PLUGIN_VERSION}`,
    "x-designli-run": runId(),
    authorization: `Bearer ${ctx.token}`,
    ...headers,
  };
  let payload;
  if (body !== undefined) {
    const text = JSON.stringify(body);
    if (gzip) {
      payload = gzipSync(Buffer.from(text));
      h["content-encoding"] = "gzip";
    } else payload = text;
    h["content-type"] = "application/json";
  }
  const retriable = method === "GET";
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(ctx.url + "/api/v1" + path, {
        method,
        headers: h,
        body: payload,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      log("http", { method, path, status: 0, ms: Date.now() - t0, error: e.message, attempt });
      if (retriable && attempt === 1) {
        await sleep(2000);
        continue;
      }
      throw new PortalError("UNREACHABLE", `cannot reach ${ctx.url}: ${e.message}`);
    }
    notePortalMeta(res.headers);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    log("http", {
      method,
      path,
      status: res.status,
      ms: Date.now() - t0,
      bytes: payload ? Buffer.byteLength(payload) : 0,
      ...(res.ok ? {} : { error: json?.error?.code || text.slice(0, 120) }),
      ...(attempt > 1 ? { attempt } : {}),
    });
    if (res.status === 426)
      throw new PortalError(
        "PLUGIN_OUTDATED",
        json?.error?.message || "the portal no longer accepts this plugin version; update it",
        json?.error?.details ?? null,
      );
    // rate limited: back off as told (a push is guarded by If-Match, so retrying it is safe)
    if (res.status === 429 && attempt <= 4) {
      await sleep(Math.min(Number(res.headers.get("retry-after")) || 2, 10) * 1000 * attempt);
      continue;
    }
    return { status: res.status, json, text, ok: res.ok };
  }
}
const expect = (r, what, okStatuses = [200, 201]) => {
  if (okStatuses.includes(r.status)) return r.json;
  throw new PortalError(
    codeOf(r.status, r.json),
    r.json?.error?.message || `${what} failed (${r.status})`,
    { status: r.status, ...(r.json?.error?.details ? { details: r.json.error.details } : {}) },
  );
};
const AGENT = { "x-designli-on-behalf": "agent" };
export const clientUrl = (ctx) => `${ctx.url}/projects/${ctx.projectId}`;
/** A release value from the portal may be a number or an object carrying one; either way, the number. */
const releaseNumber = (r) => (r && typeof r === "object" ? (r.number ?? r.id ?? null) : (r ?? null));
const stableStringify = (v) =>
  Array.isArray(v)
    ? "[" + v.map(stableStringify).join(",") + "]"
    : v && typeof v === "object"
      ? "{" +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + stableStringify(v[k]))
          .join(",") +
        "}"
      : JSON.stringify(v ?? null);
/**
 * sha256 of a stable JSON of the manifest minus the fields a push changes without a content
 * change (generatedAt, generator, publish, contentHash, componentsHash). contentHash covers
 * screens only; title/goal/order/next/entryPoints/waivers changes are invisible to it, and the
 * portal applies journey order/next on a reused push, so a metadata-only change must still push.
 */
export function manifestHashOf(manifest) {
  const { generatedAt, generator, publish, contentHash, componentsHash, ...rest } = manifest || {};
  // only what the portal keeps as metadata, in a stable order: local file names (`source`,
  // `sourceDir`) and the order of states within a step are not differences the portal can see
  const byKey = (k) => (a, b) => String(a[k]).localeCompare(String(b[k]));
  const flow = { ...(rest.flow || {}) };
  delete flow.sourceDir;
  delete flow.prototype;
  const steps = (rest.steps || []).map((st) => ({ ...st, states: [...(st.states || [])].sort(byKey("state")) }));
  const screens = [...(rest.screens || [])]
    .map((s) => {
      const devices = {};
      for (const [dev, d] of Object.entries(s.devices || {})) {
        if (!d) continue;
        const { source, ...keep } = d;
        devices[dev] = keep;
      }
      return { ...s, devices, includes: [...(s.includes || [])].sort() };
    })
    .sort(byKey("id"));
  const transitions = [...(rest.transitions || [])].sort((a, b) => `${a.from}|${a.on}|${a.to}`.localeCompare(`${b.from}|${b.on}|${b.to}`));
  const canonical = { ...rest, flow, steps, screens, transitions };
  return "sha256:" + createHash("sha256").update(stableStringify(canonical)).digest("hex");
}

// ---- reads ----
export async function overview(ctx) {
  const p = needProject(ctx);
  const [proj, flows] = await Promise.all([
    call(ctx, "GET", `/projects/${p}`),
    call(ctx, "GET", `/projects/${p}/flows`),
  ]);
  if (proj.status === 404)
    throw new PortalError(
      "NOT_FOUND",
      `project ${p} does not exist on ${ctx.url} (or the token cannot see it)`,
    );
  const pj = expect(proj, "project");
  const fl = expect(flows, "flows");
  return {
    project: { id: pj.id, name: pj.name, product: pj.product ?? null, release: pj.release ?? null },
    flows: (fl.flows || []).map((f) => ({
      id: f.id,
      title: f.title,
      version: f.latestVersion,
      openThreads: f.openThreads,
      pendingEdits: f.pendingEdits,
      missingStates: f.missingStates ?? null,
      position: f.position ?? null,
      archivedAt: f.archivedAt ?? null,
    })),
    url: clientUrl(ctx),
  };
}
export async function head(ctx, slug) {
  const p = needProject(ctx);
  const r = await call(ctx, "GET", `/projects/${p}/flows/${slug}/head`);
  if (r.status === 404)
    return {
      exists: false,
      version: 0,
      contentHash: null,
      openThreads: 0,
      pendingEdits: 0,
      lastActivityAt: null,
      structure: null,
      structureUpdatedAt: null,
      flow: null,
    };
  return { exists: true, ...expect(r, "head") };
}
export async function listReleases(ctx) {
  const p = needProject(ctx);
  const j = expect(await call(ctx, "GET", `/projects/${p}/releases`), "releases");
  const cache = {
    schema: 1,
    portal: { url: ctx.url, projectId: p },
    fetchedAt: new Date().toISOString(),
    releases: j.releases || [],
  };
  mkdirSync(join(ctx.project, "design"), { recursive: true });
  writeFileSync(
    join(ctx.project, "design", "releases.json"),
    JSON.stringify(cache, null, 2) + "\n",
  );
  return cache.releases;
}

// ---- local sync files ----
function readEdits(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "text-edits.json"), "utf8"));
  } catch {
    return { schema: 1, edits: [], appliedLocally: [] };
  }
}
const writeEdits = (dir, data) =>
  writeFileSync(join(dir, "text-edits.json"), JSON.stringify(data, null, 2) + "\n");
function readComments(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "comments.json"), "utf8"));
  } catch {
    return { schema: 1, threads: [] };
  }
}
/** "Unpulled" as the server sees it: activity or structure edits after the last pull. */
const unpulled = (h, flow) => {
  const since = Date.parse(flow.portal?.lastPullAt || 0) || 0;
  const items = [];
  if (h.lastActivityAt && Date.parse(h.lastActivityAt) > since)
    items.push("comments or copy edits");
  if (h.structureUpdatedAt && Date.parse(h.structureUpdatedAt) > since)
    items.push("structure (waivers, titles, entry points)");
  return items;
};

// ---- pull ----
async function pageAll(ctx, path, key) {
  const items = [];
  let cursor = null;
  let first = null;
  do {
    const r = await call(
      ctx,
      "GET",
      `${path}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    const j = expect(r, "pull");
    first ??= j;
    items.push(...(j[key] || []));
    cursor = j.nextCursor || null;
  } while (cursor);
  return { items, first };
}
/** Merges the portal-side structure into flow.json. A file always wins over a waiver. */
export function mergeStructure(flow, dir, structure, position) {
  const changes = [];
  if (!structure && !Number.isInteger(position)) return changes;
  const r = resolveStates(flow, dir);
  const byN = new Map(r.steps.map((s) => [s.n, s]));
  for (const [n, states] of Object.entries(structure?.waivers || {})) {
    const local = (flow.steps || []).find((s) => s.n === n);
    const res = byN.get(n);
    if (!local || !res) continue;
    for (const [state, reason] of Object.entries(states)) {
      const cur = res.states[state];
      if (cur?.status === "present") {
        changes.push({
          kind: "waiver-ignored",
          step: n,
          state,
          reason,
          why: "the state has a file; a file wins over a waiver",
        });
        continue;
      }
      const next = `n/a: ${reason}`;
      if (local.states[state] !== next) {
        local.states[state] = next;
        changes.push({ kind: "waiver", step: n, state, reason });
      }
    }
  }
  for (const [n, title] of Object.entries(structure?.stepTitles || {})) {
    const local = (flow.steps || []).find((s) => s.n === n);
    if (local && local.title !== title) {
      local.title = title;
      changes.push({ kind: "step-title", step: n, title });
    }
  }
  if (
    Array.isArray(structure?.entryPoints) &&
    JSON.stringify(structure.entryPoints) !== JSON.stringify(flow.entryPoints || [])
  ) {
    flow.entryPoints = structure.entryPoints;
    changes.push({ kind: "entry-points", entryPoints: structure.entryPoints });
  }
  if (Number.isInteger(position) && position !== flow.order) {
    changes.push({ kind: "order", from: flow.order ?? null, to: position });
    flow.order = position;
  }
  return changes;
}
/** Pulls threads, copy edits and structure of one flow into the repo. `head` reuses an already-fetched one. */
export async function pullFlow(ctx, dir, { status = "all", head: presetHead } = {}) {
  const p = needProject(ctx);
  const flow = readFlow(dir);
  const slug = flow.slug;
  const h = presetHead ?? (await head(ctx, slug));
  if (!h.exists)
    return { flow: slug, exists: false, pulled: 0, textEdits: 0, structureChanges: [] };
  const { items: threads, first } = await pageAll(
    ctx,
    `/projects/${p}/flows/${slug}/comments?status=${status}`,
    "threads",
  );
  const { items: edits } = await pageAll(
    ctx,
    `/projects/${p}/flows/${slug}/text-edits?status=all`,
    "edits",
  );
  const cur = readComments(dir);
  const byId = new Map((cur.threads || []).map((t) => [t.id, t]));
  for (const t of threads) {
    const prev = byId.get(t.id);
    if (!prev || new Date(t.updatedAt) >= new Date(prev.updatedAt)) byId.set(t.id, t);
  }
  writeFileSync(
    join(dir, "comments.json"),
    JSON.stringify(
      {
        schema: 1,
        flow: slug,
        source: "portal",
        portal: { url: ctx.url, projectId: p, flowId: slug },
        pulledAt: new Date().toISOString(),
        threads: [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      },
      null,
      2,
    ) + "\n",
  );
  const prevEdits = readEdits(dir);
  writeEdits(dir, {
    schema: 1,
    flow: slug,
    pulledAt: new Date().toISOString(),
    edits,
    appliedLocally: prevEdits.appliedLocally || [],
  });
  const structureChanges = mergeStructure(flow, dir, h.structure, h.flow?.position);
  flow.portal = {
    ...(flow.portal || { url: ctx.url, projectId: p, flowId: slug }),
    previousPullAt: flow.portal?.lastPullAt ?? null,
    lastPullAt: first?.serverTime || new Date().toISOString(),
    remoteVersion: h.version ?? null,
    structureUpdatedAt: h.structureUpdatedAt ?? null,
  };
  writeFlow(dir, flow);
  return {
    flow: slug,
    exists: true,
    pulled: threads.length,
    open: threads.filter((t) => t.status === "open").length,
    sentToAgent: threads.filter((t) => t.sentToAgent && t.status === "open").length,
    textEdits: edits.length,
    pendingEdits: edits.filter((e) => e.status === "pending").length,
    structureChanges,
    remoteVersion: h.version,
    localVersion: flow.portal?.version ?? 0,
  };
}
export async function pullAll(ctx, { flows, status } = {}) {
  const all = listFlows(ctx.project).filter((f) => !flows || flows.includes(f.slug));
  const out = [];
  for (const f of all) out.push(await pullFlow(ctx, f.dir, { status }));
  return out;
}

// ---- push and publish ----
async function markApplied(ctx, dir, slug, version) {
  const ed = readEdits(dir);
  const ids = (ed.appliedLocally || []).map((a) => a.id);
  if (!ids.length) return 0;
  const m = await call(
    ctx,
    "POST",
    `/projects/${ctx.projectId}/flows/${slug}/text-edits/mark-applied`,
    { ids, version },
    AGENT,
  );
  if (m.status !== 200) return 0;
  ed.appliedLocally = [];
  ed.edits = (ed.edits || []).map((e) =>
    ids.includes(e.id) ? { ...e, status: "applied", appliedInVersion: version } : e,
  );
  writeEdits(dir, ed);
  return m.json.updated ?? ids.length;
}
/**
 * Pushes one flow (bundle first). Throws STALE_LOCAL when the portal has feedback the repo has
 * not pulled. `head`/`bundle` reuse ones already computed by the caller (publish's plan loop)
 * instead of refetching or rebuilding.
 */
export async function pushFlow(ctx, flowRef, { force = false, note, head: presetHead, bundle: presetBundle } = {}) {
  const p = needProject(ctx);
  const dir = resolveFlowDir(ctx.project, flowRef);
  const b = presetBundle ?? buildFlowBundle(ctx.project, dir);
  if (!b.ok)
    throw new PortalError("BUNDLE", `${b.slug}: ${b.errors.join("; ")}`, { errors: b.errors });
  const flow = readFlow(dir);
  const slug = flow.slug;
  const h = presetHead ?? (await head(ctx, slug));
  const localHead = flow.portal?.version ?? 0;
  const ifMatch = force ? String(h.version) : String(localHead);
  const headers = { "if-match": ifMatch };
  if (flow.portal?.lastPullAt) headers["x-designli-last-pull"] = flow.portal.lastPullAt;
  const q = [force ? "force=1" : null, note ? "note=" + encodeURIComponent(note) : null]
    .filter(Boolean)
    .join("&");
  const r = await call(
    ctx,
    "POST",
    `/projects/${p}/flows/${slug}/versions${q ? "?" + q : ""}`,
    { manifest: b.manifest, files: b.files },
    headers,
    true,
  );
  if (r.status === 409)
    throw new PortalError(
      "STALE_LOCAL",
      r.json?.error?.message || `${slug}: the portal changed since the last pull`,
      {
        flow: slug,
        remoteHead: h.version,
        localHead,
        details: r.json?.error?.details,
        fix: "run feedback_pull (the feedback prompt), review what arrived, then publish again; force only when a human asked",
      },
    );
  const j = expect(r, "push");
  flow.portal = {
    ...(flow.portal || {}),
    url: ctx.url,
    projectId: p,
    flowId: slug,
    version: j.version,
    contentHash: j.contentHash,
    manifestHash: manifestHashOf(b.manifest),
    versionUrl: j.url,
    pushedAt: new Date().toISOString(),
    lastPullAt: flow.portal?.lastPullAt ?? new Date().toISOString(),
  };
  writeFlow(dir, flow);
  // marks applied edits on every successful push, reused or not: an edit applied in an
  // include-only or no-hash-change push must not stay pending on the portal forever
  const marked = await markApplied(ctx, dir, slug, j.version);
  // the repo mirrors the portal after a push: threads, edits (now marked) and the pull time;
  // the head is synthesized from what the push already told us, no extra fetch
  await pullFlow(ctx, dir, {
    status: "all",
    head: { ...h, exists: true, version: j.version, contentHash: j.contentHash },
  });
  return {
    flow: slug,
    version: j.version,
    reused: !!j.reused,
    url: j.url,
    contentHash: j.contentHash,
    editsMarkedApplied: marked,
    screens: b.screens,
    warnings: b.warnings,
  };
}
export async function pushComponents(ctx) {
  const p = needProject(ctx);
  const b = buildComponentsBundle(ctx.project);
  if (b.empty) return { pushed: false, reason: "no components" };
  if (!b.ok) throw new PortalError("BUNDLE", b.errors.join("; "), { errors: b.errors });
  const j = expect(
    await call(
      ctx,
      "POST",
      `/projects/${p}/components/versions`,
      { manifest: b.manifest, files: b.files },
      {},
      true,
    ),
    "components push",
  );
  return {
    pushed: true,
    version: j.version,
    reused: !!j.reused,
    contentHash: j.contentHash,
    screens: b.screens,
  };
}
/**
 * Publishes a release: every flow (or the listed ones) is bundled and pushed when changed, the
 * components too, then one release records the snapshot. Refuses before pushing anything when a
 * flow has unpulled feedback (unless force), so a release never overwrites unread comments.
 * Nothing to push and no note/force given: reports `noop` without recording a release.
 */
export async function publish(ctx, { note, flows, dryRun = false, force = false } = {}) {
  const p = needProject(ctx);
  const ov = await overview(ctx);
  // the full local flow list, before the `flows` subset filter, so a flow the designer excluded
  // from this release does not falsely show up as portal-only
  const everyFlow = listFlows(ctx.project);
  const repoSlugs = new Set(everyFlow.map((f) => f.slug));
  const portalOnly = ov.flows
    .filter((f) => !repoSlugs.has(f.id) && !f.archivedAt)
    .map((f) => ({ flow: f.id, title: f.title, version: f.version }));
  const all = everyFlow.filter((f) => !flows || flows.includes(f.slug));
  if (!all.length)
    throw new PortalError(
      "VALIDATION",
      flows
        ? `no such flows: ${flows.join(", ")}`
        : "no flows declared under design/flows; run adopt first",
    );
  const allGaps = gapsOf(ctx.project).gaps;
  const plan = [];
  const priv = new Map(); // flow slug -> { b, h, prev }: never returned or thrown, only fed to pushFlow
  const stale = [];
  const orphaning = [];
  for (const f of all) {
    const flow = readFlow(f.dir);
    // read the previous manifest before buildFlowBundle overwrites it; trusted only when it is
    // what the portal actually has (its contentHash matches what was last pushed)
    const mpath = join(f.dir, "bundle", "manifest.json");
    let prev = null;
    if (existsSync(mpath)) {
      try {
        const pm = JSON.parse(readFileSync(mpath, "utf8"));
        if (pm.contentHash === flow.portal?.contentHash) prev = pm;
      } catch {}
    }
    const b = buildFlowBundle(ctx.project, f.dir);
    const g = allGaps.filter((x) => x.flow === f.slug && !BLOCKING.has(x.kind)).length;
    const h = await head(ctx, f.slug);
    const localVersion = flow.portal?.version ?? 0;
    const entry = {
      flow: f.slug,
      version: h.version,
      localVersion,
      contentHash: b.contentHash,
      remoteHash: h.contentHash,
      screens: b.screens,
      gaps: g,
      errors: b.errors,
    };
    if (!b.ok) entry.status = "error";
    else if (!h.exists) entry.status = "new";
    else if (h.version !== localVersion && !force) entry.status = "behind";
    else if (h.contentHash === b.contentHash && flow.portal?.manifestHash === manifestHashOf(b.manifest))
      entry.status = "unchanged";
    else if (h.contentHash === b.contentHash) entry.status = "metadata"; // pushed; the portal answers reused
    else entry.status = "changed";
    const u = h.exists ? unpulled(h, flow) : [];
    if (u.length && !force) {
      entry.unpulled = u;
      stale.push(entry);
    }
    priv.set(f.slug, { b, h, prev });
    // screens this push would remove that still carry an open thread
    const newIds = new Set((b.manifest?.screens ?? []).map((s) => s.id));
    const openOnScreen = (readComments(f.dir).threads || []).filter((t) => t.status === "open" && t.screen?.id);
    const removedIds = prev
      ? (prev.screens ?? []).map((s) => s.id).filter((id) => !newIds.has(id))
      : [...new Set(openOnScreen.map((t) => t.screen.id).filter((id) => !newIds.has(id)))];
    for (const id of removedIds) {
      const open = openOnScreen.filter((t) => t.screen.id === id);
      if (open.length)
        orphaning.push({ flow: f.slug, screen: id, openThreads: open.length, threads: open.map((t) => t.id) });
    }
    plan.push(entry);
  }
  const comps = buildComponentsBundle(ctx.project);
  const compState = comps.empty ? "none" : comps.ok ? "ready" : "error";
  if (dryRun)
    return {
      dryRun: true,
      flows: plan,
      components: { state: compState, screens: comps.screens ?? 0, errors: comps.errors },
      wouldRefuse: stale.map((s) => ({ flow: s.flow, unpulled: s.unpulled })),
      portalOnly,
      orphaning,
      wouldNoop: plan.every((e) => e.status === "unchanged"),
      lastRelease: ov.project.release,
      clientUrl: clientUrl(ctx),
    };
  if (stale.length)
    throw new PortalError(
      "STALE_LOCAL",
      `unpulled feedback on ${stale.map((s) => s.flow).join(", ")}: pull it first so the release does not overwrite what the client said`,
      {
        flows: stale.map((s) => ({ flow: s.flow, unpulled: s.unpulled })),
        fix: "run feedback_pull (the feedback prompt), address or acknowledge what arrived, then publish again; force only when a human asked",
      },
    );
  const behind = plan.filter((e) => e.status === "behind");
  if (behind.length)
    throw new PortalError(
      "STALE_LOCAL",
      `the portal has newer versions of ${behind.map((e) => `${e.flow} (v${e.version}, this repo knows v${e.localVersion})`).join(", ")}`,
      {
        flows: behind,
        fix: "someone else published from another checkout: run adopt_from_portal to rebuild the declarations from the portal, or force when a human decided this repo wins",
      },
    );
  const errors = plan.filter((e) => e.status === "error");
  if (errors.length === plan.length)
    throw new PortalError(
      "BUNDLE",
      `cannot bundle ${errors.map((e) => `${e.flow}: ${e.errors.join("; ")}`).join(" | ")}`,
      { flows: errors },
    );
  // a flow that cannot be bundled is skipped and reported; the others still ship
  const skipped = errors.map((e) => ({ flow: e.flow, errors: e.errors }));
  const pushed = [];
  const unchangedFlows = [];
  const metadataOnly = [];
  for (const e of plan) {
    if (e.status === "error") continue;
    if (e.status === "unchanged") {
      // nothing to push: the portal already has this content and this metadata
      unchangedFlows.push({ flow: e.flow, version: e.version, url: null, editsMarkedApplied: 0 });
      continue;
    }
    const pv = priv.get(e.flow);
    const r = await pushFlow(ctx, e.flow, { force, note, head: pv?.h, bundle: pv?.b });
    (r.reused ? unchangedFlows : pushed).push({
      flow: r.flow,
      version: r.version,
      url: r.url,
      editsMarkedApplied: r.editsMarkedApplied,
    });
    if (e.status === "metadata") metadataOnly.push(r.flow);
  }
  let components = { state: "none" };
  if (compState === "ready") {
    const c = await pushComponents(ctx);
    components = {
      state: c.reused ? "unchanged" : "pushed",
      version: c.version,
      screens: c.screens,
    };
  } else if (compState === "error") components = { state: "error", errors: comps.errors };
  // nothing changed and nobody asked for a note or a forced snapshot: report it without a release
  if (pushed.length === 0 && components.state !== "pushed" && !note && !force)
    return {
      noop: true,
      release: ov.project.release,
      message: `nothing changed since release ${releaseNumber(ov.project.release)}`,
      unchanged: unchangedFlows,
      metadataOnly,
      portalOnly,
      orphaning: [],
      components,
      clientUrl: clientUrl(ctx),
    };
  const relResp = await call(ctx, "POST", `/projects/${p}/releases`, {
    note: note || null,
    flows: plan.filter((e) => e.status !== "error").map((e) => e.flow),
    product: readProduct(ctx.project),
    allowUnchanged: !!force,
  });
  if (relResp.status === 409 && relResp.json?.error?.code === "RELEASE_UNCHANGED") {
    const previous = relResp.json?.error?.details?.previous ?? null;
    if (pushed.length || components.state === "pushed") {
      // another publish (a teammate, a second checkout) snapshotted these pushes a moment ago:
      // the work is on the portal and in a release, there is nothing left to record
      const releases = await listReleases(ctx).catch(() => null);
      const rel = releases?.releases?.find?.((r) => r.number === previous) ?? { number: previous };
      return {
        release: { number: rel.number, url: rel.url ?? null, note: rel.note ?? null, flows: rel.flows ?? null, summary: rel.summary ?? null },
        includedInExistingRelease: true,
        message: `your pushes are already in release ${releaseNumber(previous)}, recorded by another publish at the same moment; nothing more to record`,
        pushed,
        unchanged: unchangedFlows,
        metadataOnly,
        skipped: skipped.length ? skipped : undefined,
        portalOnly,
        orphaning,
        components,
        clientUrl: clientUrl(ctx),
      };
    }
    throw new PortalError(
      "RELEASE_UNCHANGED",
      `nothing changed since release ${releaseNumber(previous)}: the note was not recorded; pass force to record an identical snapshot`,
      { release: previous },
    );
  }
  const rel = expect(relResp, "release", [201]);
  await listReleases(ctx).catch(() => null);
  return {
    release: {
      number: rel.number,
      url: rel.url,
      note: rel.note,
      flows: rel.flows,
      summary: rel.summary ?? null,
    },
    pushed,
    unchanged: unchangedFlows,
    ...(skipped.length
      ? { skipped, warnings: skipped.map((x) => `${x.flow} was not published: ${x.errors.join("; ")}`) }
      : {}),
    components,
    gaps: plan.reduce((n, e) => n + e.gaps, 0),
    portalOnly,
    orphaning,
    metadataOnly,
    clientUrl: clientUrl(ctx),
  };
}
/** Archives (or, with undo, unarchives) a flow on the portal that the repository no longer has. */
export async function flowsArchive(ctx, slug, { undo = false } = {}) {
  const p = needProject(ctx);
  const r = await call(
    ctx,
    "POST",
    `/projects/${p}/flows/${slug}/${undo ? "unarchive" : "archive"}`,
    {},
    AGENT,
  );
  if (r.status === 404)
    throw new PortalError("UNSUPPORTED", "this portal does not archive flows yet");
  const j = expect(r, "archive", [200]);
  return { flow: slug, archived: !undo, archivedAt: j.archivedAt ?? null };
}

// ---- feedback ----
const screenIndex = (flow, dir) => {
  const r = resolveStates(flow, dir);
  const idx = new Map();
  for (const st of r.steps)
    for (const [state, v] of Object.entries(st.states))
      if (v.status === "present")
        idx.set(v.screen, { step: st.n, stepId: st.id, state, files: v.files });
  return idx;
};
/** Threads and copy edits across flows, newest first, sent-to-agent first, with the file to change. */
export function digest(project, { since, flows } = {}) {
  const items = [];
  for (const { slug, dir, flow } of listFlows(project)) {
    if (flows && !flows.includes(slug)) continue;
    const idx = screenIndex(flow, dir);
    const cutoff =
      since === "last-publish"
        ? flow.portal?.pushedAt
        : since === "last-pull"
          ? flow.portal?.previousPullAt
          : since;
    const t0 = cutoff ? Date.parse(cutoff) : 0;
    const fileOf = (screen) => {
      const s = screen && idx.get(screen.id);
      const f = s?.files?.[screen?.device] || s?.files?.desktop;
      return f ? relative(project, f) : null;
    };
    for (const t of readComments(dir).threads || []) {
      if (Date.parse(t.updatedAt) < t0) continue;
      const s = t.screen && idx.get(t.screen.id);
      items.push({
        flow: slug,
        kind: "thread",
        id: t.id,
        status: t.status,
        sentToAgent: !!t.sentToAgent,
        screen: t.screen?.id ?? null,
        device: t.screen?.device ?? null,
        step: s?.step ?? null,
        state: s?.state ?? null,
        file: fileOf(t.screen),
        author: `${t.author.name} (${t.author.role})`,
        text: t.text,
        replies: (t.replies || []).length,
        updatedAt: t.updatedAt,
        url: flow.portal?.url
          ? `${flow.portal.url}/projects/${flow.portal.projectId}/flows/${slug}?tab=comments&thread=${t.id}`
          : null,
      });
    }
    for (const e of readEdits(dir).edits || []) {
      if (Date.parse(e.updatedAt) < t0) continue;
      const s = idx.get(e.screen.id);
      items.push({
        flow: slug,
        kind: "edit",
        id: e.id,
        status: e.status,
        sentToAgent: false,
        screen: e.screen.id,
        device: e.screen.device,
        step: s?.step ?? null,
        state: s?.state ?? null,
        file: fileOf(e.screen),
        author: `${e.author.name} (${e.author.role})`,
        text: { original: e.originalText, new: e.newText },
        updatedAt: e.updatedAt,
      });
    }
  }
  const rank = (i) =>
    (i.status === "open" || i.status === "pending" ? 0 : i.status === "dismissed" ? 1 : 2) * 10 +
    (i.sentToAgent ? 0 : 1);
  items.sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
  return {
    items,
    open: items.filter((i) => i.kind === "thread" && i.status === "open").length,
    pendingEdits: items.filter((i) => i.kind === "edit" && i.status === "pending").length,
  };
}
const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rxEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const textPattern = (text) =>
  new RegExp(
    "(>\\s*)" + escHtml(text).trim().split(/\s+/).map(rxEscape).join("\\s+") + "(\\s*<)",
    "g",
  );
function applyEditToFile(file, edit) {
  if (!file || !existsSync(file)) return { file, result: "missing-file" };
  const src = readFileSync(file, "utf8");
  const rx = textPattern(edit.originalText);
  // the head (a <title> that repeats the h1) is not what the client edited
  const headEnd = (() => {
    const m = src.match(/<\/head>/i);
    return m ? m.index : 0;
  })();
  const matches = [...src.matchAll(rx)].filter((m) => m.index >= headEnd);
  if (matches.length === 0) return { file, result: "not-found" };
  if (matches.length > 1) return { file, result: "ambiguous", count: matches.length };
  const m = matches[0];
  const next =
    src.slice(0, m.index) + m[1] + escHtml(edit.newText) + m[2] + src.slice(m.index + m[0].length);
  writeFileSync(file, next);
  return { file, result: "applied" };
}
/** Applies pending copy edits to the screen file, or to the include that holds the text. */
export function editsApply(project, flowRef) {
  const dir = resolveFlowDir(project, flowRef);
  const flow = readFlow(dir);
  const proto = readPrototype(project);
  const compDir = resolve(project, proto.components);
  const idx = screenIndex(flow, dir);
  const data = readEdits(dir);
  const pending = (data.edits || []).filter(
    (e) => e.status === "pending" && !(data.appliedLocally || []).some((a) => a.id === e.id),
  );
  const results = [];
  for (const e of pending) {
    const s = idx.get(e.screen.id);
    const main = s?.files?.[e.screen.device] || s?.files?.desktop || null;
    const r = {
      id: e.id,
      screen: e.screen,
      originalText: e.originalText,
      newText: e.newText,
      files: [],
    };
    let hit = applyEditToFile(main, e);
    r.files.push({ ...hit, file: hit.file ? relative(project, hit.file) : null });
    if (hit.result === "not-found" && main) {
      // the text may live in a shared part
      // the include tree of the screen: Header, and what Header imports (Logo), and so on
      const names = [];
      const queue = [...scanFile(main).includes];
      while (queue.length) {
        const name = queue.shift();
        if (names.includes(name)) continue;
        names.push(name);
        const cf0 = componentFile(name, [compDir, dir]);
        if (cf0) queue.push(...scanFile(cf0).includes);
      }
      for (const name of names) {
        const cf = componentFile(name, [compDir, dir]);
        if (!cf) continue;
        const h2 = applyEditToFile(cf, e);
        // how far the include reaches: every screen file of every flow that pulls it in
        const screensUsing = listFlows(project)
          .flatMap((f) => [...resolveStates(f.flow, f.dir).usedFiles.keys()])
          .filter((sf) => scanFile(sf).includes.includes(name)).length;
        r.files.push({ ...h2, file: relative(project, cf), include: name, screensUsing });
        if (h2.result === "applied") {
          hit = h2;
          break;
        }
      }
    } else if (hit.result === "applied" && s?.files) {
      const other = e.screen.device === "mobile" ? s.files.desktop : s.files.mobile;
      if (other && other !== main) {
        const h3 = applyEditToFile(other, e);
        r.files.push({ ...h3, file: relative(project, other), sibling: true });
      }
      // the same label in the step's other states (Validation, Error…) changes with it
      const done = new Set([main, other].filter(Boolean));
      for (const [id, o] of idx)
        if (id !== e.screen.id && o.step === s.step && o.stepId === s.stepId)
          for (const f of Object.values(o.files || {}))
            if (f && !done.has(f)) {
              done.add(f);
              const h4 = applyEditToFile(f, e);
              if (h4.result === "applied")
                r.files.push({ ...h4, file: relative(project, f), sibling: "state" });
            }
    }
    r.result = hit.result;
    // an edit requested on an older version whose text is now gone is a candidate to outdate,
    // not a manual fix: the text it targeted no longer exists to be found
    r.stale = (e.flowVersion ?? 0) < (flow.portal?.version ?? 0);
    if (hit.result !== "applied") r.suggest = r.stale && hit.result !== "ambiguous" ? "outdate" : "manual";
    if (hit.result === "applied")
      data.appliedLocally = [
        ...(data.appliedLocally || []),
        {
          id: e.id,
          files: r.files.filter((f) => f.result === "applied").map((f) => f.file),
          at: new Date().toISOString(),
        },
      ];
    results.push(r);
  }
  writeEdits(dir, data);
  const outdateCount = results.filter((r) => r.suggest === "outdate").length;
  return {
    flow: flow.slug,
    applied: results.filter((r) => r.result === "applied").length,
    needsManual: results.filter((r) => r.result !== "applied"),
    results,
    note:
      "the next publish marks applied edits as applied on the portal" +
      (outdateCount
        ? `; ${outdateCount} item(s) were requested on an older version and their text is gone (suggest: outdate)`
        : ""),
  };
}
/** Declines a copy edit with a reason the client reads as a thread on that screen. */
export async function editsDismiss(ctx, flowRef, id, reason) {
  const p = needProject(ctx);
  const dir = resolveFlowDir(ctx.project, flowRef);
  const slug = readFlow(dir).slug;
  if (!reason || !String(reason).trim())
    throw new PortalError("VALIDATION", "a reason is required");
  const data = readEdits(dir);
  const e = (data.edits || []).find((x) => x.id === id);
  if (!e)
    throw new PortalError("NOT_FOUND", `${id} is not in ${slug}'s text-edits.json; pull first`);
  const patched = expect(
    await call(
      ctx,
      "PATCH",
      `/projects/${p}/flows/${slug}/text-edits/${id}`,
      { status: "dismissed" },
      AGENT,
    ),
    "dismiss",
  );
  const text = `Copy edit not applied: "${e.originalText}" → "${e.newText}". ${String(reason).trim()}`;
  const thread = expect(
    await call(
      ctx,
      "POST",
      `/projects/${p}/flows/${slug}/comments`,
      { text, screen: e.screen, flowVersion: e.flowVersion ?? null },
      AGENT,
    ),
    "reply",
    [201],
  );
  data.edits = data.edits.map((x) =>
    x.id === id ? { ...x, status: "dismissed", updatedAt: patched.updatedAt ?? x.updatedAt } : x,
  );
  data.appliedLocally = (data.appliedLocally || []).filter((a) => a.id !== id);
  writeEdits(dir, data);
  return { flow: slug, edit: id, status: "dismissed", thread: thread.id };
}
/** Marks a pending copy edit outdated because its text changed in a later version, and tells the client so on that screen. */
export async function editsOutdate(ctx, flowRef, id, note) {
  const p = needProject(ctx);
  const dir = resolveFlowDir(ctx.project, flowRef);
  const flow = readFlow(dir);
  const slug = flow.slug;
  const data = readEdits(dir);
  const e = (data.edits || []).find((x) => x.id === id);
  if (!e)
    throw new PortalError("NOT_FOUND", `${id} is not in ${slug}'s text-edits.json; pull first`);
  if (e.status !== "pending")
    throw new PortalError("VALIDATION", `${id} is ${e.status}, not pending`);
  const patched = expect(
    await call(
      ctx,
      "PATCH",
      `/projects/${p}/flows/${slug}/text-edits/${id}`,
      { status: "outdated", note: note ?? null },
      AGENT,
    ),
    "outdate",
  );
  const version = flow.portal?.version ?? e.flowVersion;
  const trimmedNote = note && String(note).trim();
  const text =
    `This text changed in version ${version} after the request ("${e.originalText}" → "${e.newText}"); please have another look.` +
    (trimmedNote ? ` ${trimmedNote}` : "");
  const thread = expect(
    await call(
      ctx,
      "POST",
      `/projects/${p}/flows/${slug}/comments`,
      { text, screen: e.screen, flowVersion: version },
      AGENT,
    ),
    "reply",
    [201],
  );
  data.edits = data.edits.map((x) =>
    x.id === id ? { ...x, status: "outdated", updatedAt: patched.updatedAt ?? x.updatedAt } : x,
  );
  data.appliedLocally = (data.appliedLocally || []).filter((a) => a.id !== id);
  writeEdits(dir, data);
  return { flow: slug, edit: id, status: "outdated", thread: thread.id, version };
}
export async function reply(ctx, flowRef, thread, text) {
  const p = needProject(ctx);
  const slug = readFlow(resolveFlowDir(ctx.project, flowRef)).slug;
  return {
    thread,
    reply: expect(
      await call(
        ctx,
        "POST",
        `/projects/${p}/flows/${slug}/comments/${thread}/replies`,
        { text },
        AGENT,
      ),
      "reply",
      [201],
    ),
  };
}
export async function resolveThread(ctx, flowRef, thread, reopen = false) {
  const p = needProject(ctx);
  const slug = readFlow(resolveFlowDir(ctx.project, flowRef)).slug;
  return {
    thread: expect(
      await call(
        ctx,
        "POST",
        `/projects/${p}/flows/${slug}/comments/${thread}/${reopen ? "reopen" : "resolve"}`,
        {},
        AGENT,
      ),
      reopen ? "reopen" : "resolve",
    ),
  };
}

// ---- adopt from the portal ----
/** Rebuilds prototype.json and every flow.json from the portal's latest versions; downloads screens whose source is not in the repo. */
export async function adoptFromPortal(ctx) {
  const p = needProject(ctx);
  const ov = await overview(ctx);
  const written = [];
  const downloaded = [];
  const notRebuilt = []; // unavailable states the portal has no file for
  const proto = readPrototype(ctx.project);
  const { exists, ...protoBase } = proto;
  const nextProto = {
    ...protoBase,
    ...(ov.project.product ? { product: ov.project.product } : {}),
  };
  for (const f of ov.flows) {
    if (!f.version) continue;
    const v = expect(
      await call(ctx, "GET", `/projects/${p}/flows/${f.id}/versions/latest`),
      `version of ${f.id}`,
    );
    const m = v.manifest;
    const h = await head(ctx, f.id);
    const dir = flowDirOf(ctx.project, f.id);
    mkdirSync(dir, { recursive: true });
    const cur = readFlow(dir) || { schema: 2, slug: f.id, status: "draft", reviews: [] };
    const byId = new Map((m.screens || []).map((s) => [s.id, s]));
    // the devices the flow really has screens for, in canonical order (the manifest always lists desktop)
    const devices = ["desktop", "mobile"].filter((d) =>
      (m.screens || []).some((sc) => sc.kind === "state" && sc.devices?.[d]),
    );
    if (!devices.length) devices.push("desktop");
    const steps = [];
    for (const st of m.steps || []) {
      const states = {};
      for (const x of st.states || []) {
        if (x.waived) {
          states[x.state] = `n/a: ${x.waived}`;
          continue;
        }
        if (x.unavailable) {
          // the portal never received this screen (too large to publish); nothing to rebuild
          notRebuilt.push(`${f.id} ${st.n} ${x.state}: ${x.unavailable.reason}${x.unavailable.bytes ? ` (${(x.unavailable.bytes / 1048576).toFixed(1)} MB)` : ""}`);
          continue;
        }
        const sc = byId.get(x.screen);
        if (!sc) continue;
        const files = {};
        for (const [dev, d] of Object.entries(sc.devices || {})) {
          if (!d) continue;
          const local = d.source && existsSync(join(dir, d.source)) ? d.source : null;
          if (local) files[dev] = local;
          else {
            const name = `${x.screen}${dev === "mobile" ? "-Mobile" : ""}.html`;
            const raw = await fetch(`${ctx.url}/p/${p}/${f.id}/v${v.number}/${d.file}?raw=1`, {
              headers: { authorization: `Bearer ${ctx.token}` },
            });
            if (!raw.ok)
              throw new PortalError(
                "PORTAL",
                `cannot download ${d.file} of ${f.id} (${raw.status})`,
              );
            writeFileSync(join(dir, name), await raw.text());
            downloaded.push(relative(ctx.project, join(dir, name)));
            files[dev] = name;
          }
        }
        states[x.state] = Object.keys(files).length === 1 && files.desktop ? files.desktop : files;
      }
      steps.push({
        n: st.n,
        id: st.id,
        kind: st.kind,
        ...(h.structure?.stepTitles?.[st.n] ? { title: h.structure.stepTitles[st.n] } : {}),
        ...(st.surface ? { surface: st.surface } : {}),
        ...(st.purpose ? { purpose: st.purpose } : {}),
        ...(st.primaryAction ? { primaryAction: st.primaryAction } : {}),
        states,
      });
    }
    const flow = {
      ...cur,
      schema: 2,
      slug: f.id,
      title: h.flow?.title || m.flow?.title || f.id,
      goal: h.flow?.goal ?? m.flow?.goal ?? "",
      order: Number.isInteger(h.flow?.position) ? h.flow.position : (m.flow?.order ?? null),
      next: h.flow?.next || m.flow?.next || [],
      entryPoints: h.structure?.entryPoints || m.entryPoints || [],
      devices,
      ...(m.flow?.prototype ? { prototype: true } : {}),
      steps,
      transitions: m.transitions || [],
      portal: {
        ...(cur.portal || {}),
        url: ctx.url,
        projectId: p,
        flowId: f.id,
        version: v.number,
        contentHash: v.contentHash,
        manifestHash: manifestHashOf(m),
        versionUrl: v.url,
        pushedAt: v.createdAt,
        lastPullAt: cur.portal?.lastPullAt ?? null,
      },
    };
    delete flow.device;
    delete flow.frame;
    delete flow.mobileFrame;
    delete flow.artifact;
    mergeStructure(flow, dir, h.structure, h.flow?.position);
    writeFlow(dir, flow);
    written.push(relative(ctx.project, join(dir, "flow.json")));
    await pullFlow(ctx, dir, { status: "all" });
  }
  mkdirSync(join(ctx.project, "design"), { recursive: true });
  writeFileSync(
    join(ctx.project, "design", "prototype.json"),
    JSON.stringify(nextProto, null, 2) + "\n",
  );
  written.push("design/prototype.json");
  await listReleases(ctx).catch(() => null);
  return {
    written,
    downloaded,
    notRebuilt,
    flows: ov.flows.map((f) => f.id),
    release: ov.project.release,
    note: downloaded.length
      ? "downloaded screens are flattened (includes inlined); the source with includes lives only in git"
      : undefined,
  };
}

// ---- handoff ----
export async function handoff(ctx, flowRef, { story, components } = {}) {
  const p = needProject(ctx);
  const dir = resolveFlowDir(ctx.project, flowRef);
  const flow = readFlow(dir);
  if (!story || !String(story).trim())
    throw new PortalError("VALIDATION", "a story title is required");
  const g = gapsOf(ctx.project, { flow: flow.slug, strict: true }).gaps.filter(
    (x) => x.kind !== "no-product",
  );
  if (g.length)
    throw new PortalError(
      "VALIDATION",
      `${flow.slug} has ${g.length} gap(s) that block the handoff`,
      { gaps: g },
    );
  const b = buildFlowBundle(ctx.project, dir);
  const h = await head(ctx, flow.slug);
  if (!h.exists || h.contentHash !== b.contentHash)
    throw new PortalError(
      "VALIDATION",
      `${flow.slug}: the portal does not have the current screens; publish first`,
      { remoteHash: h.contentHash, localHash: b.contentHash },
    );
  const comps = [
    ...new Set([...(components || []), ...b.manifest.screens.flatMap((s) => s.includes || [])]),
  ].map(componentId);
  const j = expect(
    await call(ctx, "POST", `/projects/${p}/flows/${flow.slug}/handoffs`, {
      story: String(story).trim(),
      components: comps,
    }),
    "handoff",
    [200, 201],
  );
  flow.status = "handed-off";
  flow.story = String(story).trim();
  writeFlow(dir, flow);
  return {
    id: j.id,
    url: j.url,
    specUrl: j.specUrl,
    version: j.version,
    releaseNumber: j.releaseNumber ?? null,
    components: comps,
  };
}
