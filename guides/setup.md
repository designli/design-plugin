# setup: connect this repository to the Designli portal

Run this once per repository, before `adopt`. It is a conversation with the designer (or with the developer setting the repo up); every step has a default. The `designli-design` MCP server's `project_status`, `credentials_status`, `portal_projects` and `setup_write` tools do the work; the same steps are available as the interactive CLI `node <plugin>/scripts/setup.mjs`, which is the better route when a token has to be pasted (it reads it with the echo off).

Never ask for the token in chat, never write it into a file inside the repository, never print it back.

## Step 1: where are we

Call `project_status`. Note the git remote (refuse to finish without one unless the designer accepts the risk: the portal keeps flattened screens, the source with its includes lives only in git), whether `design/prototype.json` exists, the flows under `design/flows/`, the `publish` block of `design/library.json`, the credentials state (`tokenSource`: `env`, `credentials` or none) and any harness config found (`.mcp.json`).

## Step 2: portal URL

Default: `DESIGNLI_PORTAL_URL`, else the URL already in `library.json`, else `https://portal.designli.co`. Plain `http://` is only accepted for `localhost`.

## Step 3: token

If `credentials_status` reports a valid token for that URL (it calls the portal's `/me`), show who it belongs to and its scope (projects, permissions, expiry) and move on.

Otherwise explain, in two sentences, how to get one: sign in to the portal, open **Account**, "New token", and pick the narrowest scope that does the job (this project only; `view`, `comment`, `push`, `suggest_copy`; an expiry of 90 days is a good default). Then have the designer run `node <plugin>/scripts/setup.mjs` in a terminal (it asks for the token with the input hidden and stores it in `~/.config/designli-design/credentials.json`, readable only by them) or `export DESIGNLI_PORTAL_TOKEN=…` in the shell that starts the agent. Wait for them; then call `credentials_status` again.

## Step 4: project

Call `portal_projects`. Show the projects the token can see (id, name, preset). Ask which one this repository is (default: the one whose id matches the repository name). If the list is empty: the token owner is not a member of any project; an admin adds members from Admin → Projects; do not create projects unless the designer is an admin and asks (`portal_projects` with `create: { id, name }`).

## Step 5: write the connection

Call `setup_write` with the URL, the project id and the harness (`claude` when the designer uses Claude Code, `generic` to only print the MCP configuration, `none` for CLI-only use). It writes:

- `design/library.json` → `publish: { target: "portal", portal: { url, projectId } }` and `harness`;
- for `claude`: `.mcp.json` in the repo with the `designli-portal` server (the portal's MCP endpoint) whose header is `Authorization: Bearer ${DESIGNLI_PORTAL_TOKEN}`, expanded from the environment at start; the literal token is never written. The local `designli-design` server comes with the plugin itself. For `generic`, both servers are printed;
- `.gitignore` entries for `design/**/bundle/`, `design/**/.seed/`, `design/**/.review/` and `.mcp.local.json`.

Show `git status --short` and say which of these files to commit (`.mcp.json` and `library.json` are safe: they hold no secret).

## Step 6: what to do next

`setup_write` returns `nextSteps`; read them to the designer verbatim. They depend on the state found in Step 1:

- nothing declared yet, screens under `design/` → `adopt` (building screens first? load the `prototype` guide);
- nothing declared locally, flows on the portal → `adopt --from-portal` (a fresh clone or a lost repository);
- feedback waiting on the portal → `feedback`;
- flows with unpublished changes → `publish "<what changed>"`;
- everything published → share the project URL with the client; `handoff <slug> "<story>"` when a flow is ready for developers.

In Claude Code the prompts are `/designli-design:<name>`; on any MCP client they are the prompts of this server with the same names (`setup`, `prototype`, `adopt`, `publish`, `feedback`, `handoff`, `status`, `review`).

## Security rules you follow

- The token lives in the environment or in the user's credentials file, nowhere else. Refuse to echo it, commit it or put it in a config file.
- `https` only, except `localhost`.
- Recommend a scoped token (one project, the permissions the workflow needs, an expiry); an unscoped token is for admins doing admin work.
- If `.mcp.json` already contains a literal `dpat_` value, say so and ask the designer to revoke that token on Account and replace it with the environment variable.
