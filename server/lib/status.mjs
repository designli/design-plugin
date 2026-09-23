// Where a repository stands: environment, connection, prototype, flows, gaps, sync state.
// Local only (no network); the portal side is added by the server's project_status tool.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { readLibrary, CRED_FILE } from "./setup.mjs";
import { readPrototype, readProduct, sourcesIn } from "./proto.mjs";
import { listFlows, resolveStates, gapsOf } from "./flows.mjs";
import { buildFlowBundle } from "./bundle.mjs";

const git = (cmd, cwd) => {
  try {
    return execSync(`git ${cmd}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};
export function gitInfo(project) {
  const root = git("rev-parse --show-toplevel", project);
  if (!root) return { repo: false, root: null, remote: null, branch: null, dirty: null };
  const remotes = (git("remote", project) || "").split("\n").filter(Boolean);
  return {
    repo: true,
    root,
    atRoot: resolve(root) === resolve(project),
    remote: remotes.length ? git(`remote get-url ${remotes[0]}`, project) : null,
    branch: git("rev-parse --abbrev-ref HEAD", project),
    dirty: (git("status --porcelain", project) || "").split("\n").filter(Boolean).length,
  };
}
/**
 * The doctor. `require` names what must be present for the caller's verb:
 * node, git, setup (a portal connection), prototype (design/prototype.json), flows.
 */
export function preflight(project, { require: req = [], hashes = false } = {}) {
  const need = new Set(req);
  const blockers = [];
  const warnings = [];
  const block = (code, message, fix) => blockers.push({ code, message, fix });
  const warn = (code, message, fix) => warnings.push({ code, message, fix });
  const gate = (key) => (need.has(key) ? block : warn);
  const info = { project, node: process.versions.node };
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 12))
    block("NODE", `Node ${process.versions.node} is below 22.12`, "nvm install 24 && nvm use 24");
  info.git = gitInfo(project);
  if (!info.git.repo)
    gate("git")(
      "GIT",
      "not a git repository",
      "git init, add a remote, commit the prototype: the repository is the designer's working copy",
    );
  else if (!info.git.remote)
    gate("git")(
      "GIT_REMOTE",
      "the repository has no remote: a lost laptop loses the prototype's source",
      "add a remote (git remote add origin …) and push",
    );
  const lib = readLibrary(project);
  info.library = lib;
  info.harness = lib?.harness ?? null;
  info.publish = lib?.publish
    ? { target: lib.publish.target, portal: lib.publish.portal ?? null }
    : null;
  info.tokenSource = process.env.DESIGNLI_PORTAL_TOKEN
    ? "env"
    : existsSync(CRED_FILE)
      ? "credentials"
      : null;
  if (!lib?.publish?.portal)
    gate("setup")(
      "SETUP",
      "this repository is not connected to a portal project yet",
      "run the setup prompt (or node <plugin>/scripts/setup.mjs)",
    );
  else if (!info.tokenSource)
    gate("setup")(
      "PORTAL_TOKEN",
      "no portal token is configured",
      "run node <plugin>/scripts/setup.mjs (or export DESIGNLI_PORTAL_TOKEN before starting the agent)",
    );
  if (
    lib?.publish?.portal?.url &&
    /^http:\/\//.test(lib.publish.portal.url) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)/.test(lib.publish.portal.url)
  )
    warn(
      "PORTAL_HTTP",
      "the portal url is plain http; the token would travel unencrypted",
      "use https",
    );
  info.mcpJson = existsSync(join(project, ".mcp.json"));
  if (
    info.mcpJson &&
    /dpat_[A-Za-z0-9_-]{8,}/.test(readFileSync(join(project, ".mcp.json"), "utf8"))
  )
    warn(
      "TOKEN_IN_REPO",
      ".mcp.json contains a literal personal access token",
      "revoke it on the portal's Account page and reference ${DESIGNLI_PORTAL_TOKEN} instead",
    );
  let proto;
  try {
    proto = readPrototype(project);
  } catch (e) {
    block("PROTOTYPE_JSON", e.message, "fix the JSON");
    proto = { exists: false, dir: "design", components: "design/components", devices: {} };
  }
  info.prototype = proto
    ? {
        exists: proto.exists,
        dir: proto.dir,
        components: proto.components,
        devices: proto.devices,
        components_count: sourcesIn(resolve(project, proto.components)).length,
      }
    : null;
  info.product = readProduct(project);
  if (!proto?.exists)
    gate("prototype")(
      "PROTOTYPE",
      "design/prototype.json not found: the prototype has not been adopted",
      "run the adopt prompt",
    );
  if (!info.product)
    warn(
      "PRODUCT",
      "no product basics (design/prototype.json.product or PRODUCT.md)",
      "adopt asks for the name and a one-line summary",
    );
  info.flows = [];
  for (const { slug, dir, flow } of listFlows(project)) {
    const r = resolveStates(flow, dir);
    const missing = r.steps.flatMap((s) =>
      Object.entries(s.states)
        .filter(([, v]) => v.status === "missing")
        .map(([k]) => `${s.n} ${k}`),
    );
    const unavailable = r.steps.flatMap((s) =>
      Object.entries(s.states)
        .filter(([, v]) => v.status === "unavailable")
        .map(([k]) => `${s.n} ${k}`),
    );
    const entry = {
      slug,
      title: flow.title,
      order: flow.order ?? null,
      status: flow.status ?? "draft",
      steps: r.steps.length,
      screens: r.usedFiles.size,
      devices: r.devices,
      missingStates: missing,
      unavailableStates: unavailable,
      problems: r.problems.length,
      publishedVersion: flow.portal?.version ?? null,
      publishedHash: flow.portal?.contentHash ?? null,
      lastPullAt: flow.portal?.lastPullAt ?? null,
      pushedAt: flow.portal?.pushedAt ?? null,
    };
    if (hashes && !r.problems.some((p) => p.kind !== "state-unwaived")) {
      try {
        const b = buildFlowBundle(project, dir, { dry: true });
        entry.currentHash = b.contentHash;
        entry.unpublishedChanges =
          !!flow.portal?.contentHash && flow.portal.contentHash !== b.contentHash;
        entry.neverPublished = !flow.portal?.version;
      } catch (e) {
        entry.bundleError = e.message;
      }
    }
    info.flows.push(entry);
  }
  if (!info.flows.length)
    gate("flows")("NO_FLOWS", "no flows declared under design/flows", "run the adopt prompt");
  const g = gapsOf(project);
  info.gaps = {
    total: g.gaps.length,
    blocking: g.blocking.length,
    byKind: g.gaps.reduce((o, x) => ((o[x.kind] = (o[x.kind] || 0) + 1), o), {}),
  };
  const releases = join(project, "design", "releases.json");
  if (existsSync(releases)) {
    try {
      const r = JSON.parse(readFileSync(releases, "utf8"));
      info.lastRelease = r.releases?.[0]
        ? {
            number: r.releases[0].number,
            note: r.releases[0].note,
            createdAt: r.releases[0].createdAt,
            url: r.releases[0].url,
          }
        : null;
    } catch {}
  }
  const legacy = ["DESIGN.md", ".impeccable/design.json"].filter((f) =>
    existsSync(join(project, f)),
  );
  info.designDna = legacy;
  return { ok: blockers.length === 0, blockers, warnings, info };
}
/** What to do next, in the harness's own words. */
export function nextSteps({ status, portal, harness, plugin = null }) {
  const prompt = (name, args = "") =>
    harness === "claude"
      ? `/designli-design:${name}${args ? " " + args : ""}`
      : `the \`${name}\` prompt of the designli-design MCP server${args ? " with " + args : ""}`;
  const steps = [];
  if (plugin?.message) steps.push(plugin.message);
  if (plugin?.updateRequired) return steps;
  const i = status.info;
  const local = i.flows || [];
  const remote = portal?.flows || [];
  if (status.blockers.some((b) => b.code === "SETUP" || b.code === "PORTAL_TOKEN"))
    steps.push(`Connect the repository first: ${prompt("setup")}.`);
  if (!local.length && remote.some((f) => f.version))
    steps.push(
      `The portal already has ${remote.filter((f) => f.version).length} flow(s) and this repository declares none: run ${prompt("adopt", "--from-portal")} to rebuild the declarations (and any missing screen) from the latest release.`,
    );
  else if (!local.length)
    steps.push(
      `Adopt the prototype: ${prompt("adopt")} scans the HTML under design/, proposes flows, steps and states, and asks only for what it cannot infer. Building screens? Load ${prompt("prototype")} first: one file per screen state, includes for shared parts, links for transitions.`,
    );
  else {
    const gaps = i.gaps?.total ?? 0;
    const unpublished = local.filter((f) => f.neverPublished || f.unpublishedChanges);
    const feedback = remote.filter((f) => f.openThreads || f.pendingEdits);
    if (feedback.length)
      steps.push(
        `Feedback waits on the portal (${feedback.map((f) => `${f.id}: ${f.openThreads} open, ${f.pendingEdits} edits`).join("; ")}): ${prompt("feedback")} pulls it into the repo, applies the copy edits and prints the digest.`,
      );
    if (unpublished.length)
      steps.push(
        `${unpublished.map((f) => f.slug).join(", ")} ${unpublished.length === 1 ? "has" : "have"} changes the portal has not seen: ${prompt("publish", '"<what changed>"')} records the next release.`,
      );
    if (gaps)
      steps.push(
        `${gaps} gap(s) remain (${Object.entries(i.gaps.byKind)
          .map(([k, v]) => `${k} ×${v}`)
          .join(
            ", ",
          )}): ${prompt("status")} lists them; design the missing states or waive them with a reason.`,
      );
    if (!feedback.length && !unpublished.length)
      steps.push(
        `Everything is published. Share ${portal?.url || "the project page"} with the client, or hand a reviewed flow off: ${prompt("handoff", '<slug> "<story title>"')}.`,
      );
  }
  return steps;
}
