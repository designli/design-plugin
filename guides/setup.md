# setup: connect this repository to the Designli portal

Run this once per repository, before `init`. It is a conversation with the designer (or with the developer setting the repo up); every step has a default. The `designli-design` MCP server's `project_status`, `credentials_status`, `portal_projects` and `setup_write` tools do the work; the same steps are available as the interactive CLI `node <plugin>/scripts/setup.mjs`, which is the better route when a token has to be pasted (it reads it with the echo off).

Never ask for the token in chat, never write it into a file inside the repository, never print it back.

## Step 1: where are we

Call `project_status`. Note `greenfield` (no UI code yet), whether `PRODUCT.md`/`DESIGN.md` exist, the flows under `design/flows/`, the `publish` block of `design/library.json`, the credentials state (`tokenSource`: `env`, `credentials` or none) and any harness config found (`.mcp.json`).

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

- new product or repo without design DNA → `init`, then `flow "<first user journey>"`;
- design DNA present, flows on the portal → `portal_pull` and `review <slug>` for flows with open feedback (`init --refresh` first if the code changed);
- local flows never pushed → `portal_push` each;
- everything in place → `flow "<next journey>"`; when a flow is ready for developers, `handoff`.

In Claude Code the prompts are `/designli-design:init`, `/designli-design:flow`, `/designli-design:review`, `/designli-design:handoff`; on any MCP client they are the `init`, `flow`, `review` and `handoff` prompts of this server.

## Security rules you follow

- The token lives in the environment or in the user's credentials file, nowhere else. Refuse to echo it, commit it or put it in a config file.
- `https` only, except `localhost`.
- Recommend a scoped token (one project, the permissions the workflow needs, an expiry); an unscoped token is for admins doing admin work.
- If `.mcp.json` already contains a literal `dpat_` value, say so and ask the designer to revoke that token on Account and replace it with the environment variable.
