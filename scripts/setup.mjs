#!/usr/bin/env node
// Guided setup: connects a product repository to the Designli portal and says what to do next.
//   node setup.mjs                      interactive: sign in by approving a link in the browser
//   node setup.mjs --paste              interactive, but the token is typed with the echo off
//   node setup.mjs --yes --url U --project P --harness claude|generic|none [--token-stdin] [--no-store] [--target portal|local]
// The token comes from the browser approval, DESIGNLI_PORTAL_TOKEN, --token-stdin, or is typed; never from argv, never written into the repo.
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import {
  DEFAULT_PORTAL,
  normalizeUrl,
  urlAllowed,
  looksLikeToken,
  tokenFor,
  storeToken,
  whoami,
  deviceStart,
  deviceWait,
  deviceLabel,
  readLibrary,
  writePublish,
  mcpServers,
  writeMcpJson,
  ensureGitignore,
  CRED_FILE,
} from "../server/lib/setup.mjs";
import { preflight as runPreflight, nextSteps, gitInfo } from "../server/lib/status.mjs";
import { overview, context } from "../server/lib/portal.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (k) => argv.includes(k);
const yes = has("--yes");
const project = resolve(opt("--project-dir", process.cwd()));
const tty = process.stdin.isTTY && !yes;
const say = (s = "") => console.log(s);
const die = (m) => {
  console.error("setup: " + m);
  process.exit(1);
};

const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const ask = (q, d) =>
  new Promise((res) => {
    if (!rl) return res(d);
    rl.question(`${q}${d !== undefined && d !== "" ? ` [${d}]` : ""}: `, (a) => res(a.trim() || d));
  });
const askHidden = (q) =>
  new Promise((res) => {
    if (!rl) return res("");
    process.stdout.write(q + ": ");
    const orig = rl._writeToOutput;
    rl._writeToOutput = () => {};
    rl.question("", (a) => {
      rl._writeToOutput = orig;
      process.stdout.write("\n");
      res(a.trim());
    });
  });
const choose = async (q, options, d) => {
  if (!rl) return d;
  say(q);
  options.forEach((o, i) =>
    say(
      `  ${i + 1}) ${o.label}${o.value === d ? "  (default)" : ""}${o.hint ? `\n     ${o.hint}` : ""}`,
    ),
  );
  const a = await ask("Choice", String(options.findIndex((o) => o.value === d) + 1));
  const idx = Number(a) - 1;
  return options[idx]?.value ?? d;
};

// ---- 1. environment ----
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 12))
  die(`Node ${process.versions.node} is below 22.12 (nvm install 24)`);
let gitRoot = null;
try {
  gitRoot = execSync("git rev-parse --show-toplevel", {
    cwd: project,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {}
if (!gitRoot)
  die(`${project} is not inside a git repository; run setup from the product repo root`);
if (resolve(gitRoot) !== project) die(`run setup from the repository root: ${gitRoot}`);
const git = gitInfo(project);
if (!git.remote) {
  say(
    "This repository has no git remote. The portal keeps the flattened screens, but the source with its includes lives only here: a lost laptop loses it.",
  );
  if (yes && !has("--allow-no-remote"))
    die("add a remote first (git remote add origin …) or pass --allow-no-remote");
  if (!yes && (await ask("Continue without a remote? y/n", "n")) !== "y")
    die("add a remote first: git remote add origin <url> && git push -u origin main");
}
const status0 = runPreflight(project);
const info = status0.info;
const lib = readLibrary(project);
say(`designli-design setup for ${basename(project)}`);
say(
  `  prototype ${info.prototype?.exists ? "adopted" : "not adopted yet"}; flows: ${(info.flows ?? []).map((f) => f.slug).join(", ") || "none"}; product ${info.product?.name ?? "not set"}`,
);

// ---- 2. portal url ----
const target = opt("--target", lib?.publish?.target === "local" ? "local" : "portal");
let url = normalizeUrl(
  opt("--url") || process.env.DESIGNLI_PORTAL_URL || lib?.publish?.portal?.url || DEFAULT_PORTAL,
);
if (!yes) url = normalizeUrl(await ask("Portal URL", url));
if (target === "portal" && !urlAllowed(url))
  die(`refusing ${url}: use https (plain http is allowed for localhost only)`);

// ---- 3. token ----
let me = null;
if (target === "portal") {
  let { token, source } = tokenFor(url);
  if (has("--token-stdin")) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    token = Buffer.concat(chunks).toString("utf8").trim().split(/\s+/)[0];
    source = "stdin";
  }
  if (token) {
    const w = await whoami(url, token);
    if (w.ok) {
      me = w;
      say(
        `  token (${source}): ${w.user.name} <${w.user.email}>, role ${w.user.role}${w.scope ? `, scoped to ${w.scope.projects ? w.scope.projects.join(", ") : "all projects"} / ${w.scope.permissions ? w.scope.permissions.join(", ") : "all permissions"}` : ""}`,
      );
    } else {
      say(`  the ${source} token was refused by ${url}: ${w.error}`);
      token = null;
    }
  }
  if (!token) {
    if (!tty) die("no usable token; set DESIGNLI_PORTAL_TOKEN or pass --token-stdin");
    if (!has("--paste")) {
      // device sign-in: approve in the browser, nothing typed
      const start = await deviceStart(url, {
        projectId: opt("--project") || lib?.publish?.portal?.projectId || null,
        label: deviceLabel(project),
      });
      if (start.ok) {
        say("");
        say(
          "Sign in by approving this request in your browser (you must be signed in to the portal):",
        );
        say(`  ${start.verificationUrlComplete}`);
        say(`  the page must show the code ${start.userCode}`);
        process.stdout.write("  waiting for the approval");
        const until = Date.now() + start.expiresIn * 1000;
        let r = { status: "pending" };
        while (r.status === "pending" && Date.now() < until) {
          r = await deviceWait(url, start.deviceCode, {
            interval: start.interval,
            waitSeconds: 30,
            store: !has("--no-store"),
          });
          process.stdout.write(".");
        }
        say("");
        if (r.status === "approved") {
          me = r.me;
          token = r.token ?? "stored";
          say(`  hello ${me.user.name} (${me.user.role})`);
          if (r.credentialsFile) say(`  stored in ${r.credentialsFile}`);
          else say("  not stored; export DESIGNLI_PORTAL_TOKEN before running the agent");
        } else if (r.status === "denied") die("the sign-in was denied on the portal");
        else if (r.status === "error") die(r.error);
        else die("the sign-in request expired before it was approved; run setup again");
      } else if (start.unsupported) {
        say(`  ${url} does not offer browser sign-in yet; paste a token instead.`);
      } else die(`could not start the sign-in: ${start.error}`);
    }
  }
  if (!me) {
    say("");
    say("You need a personal access token for the portal:");
    say(`  1. sign in at ${url}, open Account, choose "New token"`);
    say(
      "  2. scope it: this project only, the permissions the workflow needs (view, comment, push, suggest_copy, resolve, manage_flows), an expiry (90 days is a good default)",
    );
    say(
      "  3. paste it below (input is hidden) or set DESIGNLI_PORTAL_TOKEN in the shell that starts your agent",
    );
    if (!tty) die("no usable token; set DESIGNLI_PORTAL_TOKEN or pass --token-stdin");
    for (let tries = 0; tries < 3 && !me; tries++) {
      const t = await askHidden("Token");
      if (!looksLikeToken(t)) {
        say("  that does not look like a dpat_ token");
        continue;
      }
      const w = await whoami(url, t);
      if (!w.ok) {
        say(`  refused: ${w.error}`);
        continue;
      }
      me = w;
      token = t;
      say(`  hello ${w.user.name} (${w.user.role})`);
    }
    if (!me) die("no valid token");
    if (!has("--no-store") && looksLikeToken(token)) {
      const store =
        yes ||
        (await ask("Store it in your credentials file (0600, outside the repo)? y/n", "y")) === "y";
      if (store) say(`  stored in ${storeToken(url, token)}`);
      else say("  not stored; export DESIGNLI_PORTAL_TOKEN before running the agent");
    }
  } else if (source === "stdin" && !has("--no-store")) say(`  stored in ${storeToken(url, token)}`);
}

// ---- 4. project ----
let projectId = opt("--project") || lib?.publish?.portal?.projectId || null;
if (target === "portal" && me) {
  const visible = me.projects;
  if (!visible.length && !projectId) {
    say(
      "  this token cannot see any project: a Designli admin must add its owner to the project (Admin → Projects), or create the project first",
    );
    if (me.user.role === "admin" && tty) {
      const id = await ask(
        "Create a project now? id (empty to skip)",
        basename(project)
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-"),
      );
      if (id) {
        const r = await fetch(`${url}/api/v1/projects`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${tokenFor(url).token || ""}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ id, name: await ask("Name", id) }),
        });
        if (!r.ok) die(`could not create ${id}: ${(await r.text()).slice(0, 200)}`);
        projectId = id;
      }
    }
    if (!projectId) die("no project to connect to");
  } else if (!projectId || !yes) {
    const guess =
      visible.find((p) => p.id === basename(project).toLowerCase())?.id ??
      projectId ??
      visible[0]?.id;
    projectId = await choose(
      "Which portal project is this repository?",
      visible.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.id})`,
        hint: p.preset ? `you are ${p.preset}: ${(p.permissions || []).join(", ")}` : "admin",
      })),
      guess,
    );
  }
  if (!visible.some((p) => p.id === projectId) && me.user.role !== "admin")
    die(`the token cannot see project ${projectId}`);
}
if (!projectId)
  projectId = basename(project)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");

// ---- 5. harness ----
const harness = yes
  ? opt("--harness", lib?.harness || "claude")
  : await choose(
      "Which agent harness do you use here?",
      [
        {
          value: "claude",
          label: "Claude Code",
          hint: "writes .mcp.json with the designli-design and designli-portal servers (token via ${DESIGNLI_PORTAL_TOKEN})",
        },
        {
          value: "generic",
          label: "Another MCP client",
          hint: "prints the MCP configuration to paste into your client",
        },
        { value: "none", label: "None, CLI only", hint: "only design/library.json is written" },
      ],
      lib?.harness || "claude",
    );

// ---- 6. write ----
const written = [];
written.push(writePublish(project, { url, projectId, target }));
const l2 = readLibrary(project);
l2.harness = harness;
(await import("node:fs")).writeFileSync(
  join(project, "design", "library.json"),
  JSON.stringify(l2, null, 2) + "\n",
);
const servers = mcpServers({ url, target, includeLocal: harness !== "claude" });
if (harness === "claude") written.push(writeMcpJson(project, servers));
const gi = ensureGitignore(project);
if (gi.added.length) written.push(gi.path);
if (
  existsSync(join(project, ".mcp.json")) &&
  /dpat_[A-Za-z0-9_-]{8,}/.test(readFileSync(join(project, ".mcp.json"), "utf8"))
)
  say(
    "  WARNING: .mcp.json contains a literal token; revoke it on Account and use ${DESIGNLI_PORTAL_TOKEN} instead",
  );
say("");
say("Written:");
for (const w of written) say(`  ${w}`);
if (harness === "generic") {
  say("");
  say(
    "MCP configuration for your client (token via the DESIGNLI_PORTAL_TOKEN environment variable):",
  );
  say(JSON.stringify({ mcpServers: servers }, null, 2));
}

// ---- 7. next steps ----
let portal = null;
if (target === "portal") {
  try {
    portal = await overview(context(project, { url, projectId }));
  } catch (e) {
    say(`  (could not read the project on the portal: ${e.message})`);
  }
}
say("");
say("Next:");
for (const s of nextSteps({ status: runPreflight(project, { hashes: true }), portal, harness }))
  say(`  - ${s}`);
say("");
say(
  `Credentials file: ${CRED_FILE} (never commit it). Config files written above hold no secret and can be committed.`,
);
rl?.close();
