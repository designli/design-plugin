# Design portal API contract

Implemented by `design-portal` (Bun + Hono + Drizzle + PostgreSQL). The plugin talks to it through `scripts/portal.mjs`; other agents through the MCP server at `/mcp`. Base URL from `design/library.json.publish.portal.url` or `DESIGNLI_PORTAL_URL`. All paths below are under `/api/v1` unless noted.

## Auth and roles

- **Designli staff** sign in to the web app with Google Workspace (`GET /auth/google`, hosted domain `designli.co`; other domains are refused). A first sign-in creates a `staff` user with no project access; emails listed in the portal's `ADMIN_EMAILS` become `admin`. Local Docker runs also accept `POST /auth/dev {email, name}` for allowed-domain emails (`AUTH_DEV_LOGIN=1`, never in production).
- **Clients** are created by an admin (Admin → Projects → Invite a client). They receive an invite link (`/invite/<token>`, 7 days), set a password, and sign in with `POST /auth/password {email, password}`. Regenerating an invite resets the password and signs them out everywhere.
- **Personal access tokens** for the plugin and agents: staff mint them on the portal Account page (`POST /account/tokens`), then `Authorization: Bearer dpat_…`. Add `X-Designli-On-Behalf: agent` on writes made by an agent so the portal records the author as "Claude (designli-design)" with role `agent`. `POST /session {token}` turns a token into a cookie session (API-only, used by helpers and tests).
- Token lookup in `portal.mjs`: `DESIGNLI_PORTAL_TOKEN`, then `~/.config/designli-design/credentials.json` (0600, written by `setup.mjs` or `portal.mjs login`, which read the token from stdin). Never a command-line flag, never in a repo. Mint scoped tokens (project, permissions, expiry) on the portal's Account page.

### Permissions

Global role `admin | staff | client` (`/me` → `user.role`). Admins see and modify every project and manage users, members and invites. Everyone else holds one membership per project with a preset and an explicit permission list (`/me` → `memberships[{projectId, preset, permissions}]`):

| Preset    | Permissions                                              |
| --------- | -------------------------------------------------------- |
| designer  | view, comment, suggest_copy, push, resolve, manage_flows |
| developer | view, comment                                            |
| viewer    | view, comment                                            |
| client    | view, comment, suggest_copy                              |

Admins can toggle individual permissions on a membership. `push` gates version and components pushes and `mark-applied`; `resolve` gates resolve/reopen and the send-to-agent flag (thread authors may resolve their own); `suggest_copy` gates copy edits (a suggester may only dismiss their own pending edit); `manage_flows` gates flow title/goal edits. Anything else returns 403 `FORBIDDEN`; no membership returns 403 too.

## Information architecture

Project → User flows (versioned) + one project-level Components library (versioned). Everything a customer sees belongs to one project.

## Endpoints

The endpoint reference is generated from the API's schemas and lives in the portal itself: `<portal>/docs/` (sign in as staff, or send `Authorization: Bearer dpat_…`), with `GET /api/v1/openapi.json` (OpenAPI 3.1), `GET /docs/md/<page>.md` (every page as Markdown), `GET /docs/llms.txt` and `/docs/llms-full.txt`. Over MCP the same pages are `docs://…` resources and the `read_docs` tool. Start with the **For agents** page (`/docs/md/agents.md`).

The essentials the skills rely on, so they work offline:

- Auth: `Authorization: Bearer dpat_…` on every request; `GET /api/v1/me` for identity and permissions.
- Sync: `GET /projects/:p/flows/:f/head` (version, `contentHash`, `lastActivityAt`, `structure`, `structureUpdatedAt`) → pull comments and text edits (`?status=all`, follow `nextCursor`) → `POST /projects/:p/flows/:f/versions` with `If-Match: <head version>` (0 for a new flow) and `X-Designli-Last-Pull: <serverTime of the pull>`; 409 `STALE_LOCAL` means pull first (feedback or a structure edit arrived after the last pull), `?force=1` overrides; 200 `reused: true` for an identical content hash (journey `order`/`next` still updated).
- Releases: `POST /projects/:p/releases {note, flows?, product?}` snapshots every pushed flow's current version; `GET …/releases[/:n]` (the detail diffs screens against the previous release). Structure: `PUT …/flows/:f/structure`, `POST …/flows/:f/waivers {step, state, reason|null}` (a designed state cannot be waived), `GET …/flows/:f/states` (steps × states: present, waived, missing, optional). Handoffs: `POST …/flows/:f/handoffs {story, components?}` generates and stores the spec at the current release (refused while required states are missing); `GET …/handoffs[/:id]`, `…/handoffs/:id/spec.md`.
- Comments: `GET/POST …/comments`, `POST …/comments/:t/replies`, `…/resolve`, `…/reopen`, `PATCH …/comments/:t {sentToAgent}`; `X-Designli-On-Behalf: agent` attributes writes to the agent.
- Text edits: `GET …/text-edits`, `PATCH …/text-edits/:id {status}`, `POST …/text-edits/mark-applied {ids, version}`.
- Lists page on the server: projects `page`/`limit` (25, max 100) with `total`; comments and edits `limit` (50, max 200) and `cursor` → `nextCursor`. `head`, comments and edits carry a weak ETag (304 on `If-None-Match`).
- Errors: `{error: {code, message, details}}`; codes `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `PROJECT_EXISTS` 409, `STALE_LOCAL` 409, `GONE` 410, `BUNDLE_TOO_LARGE` 413, `VALIDATION` / `HASH_MISMATCH` 422, `RATE_LIMITED` 429, `INTERNAL` 500.

## Bundle envelope

Produced by `scripts/bundle.mjs` (`server/lib/bundle.mjs`): `manifest.json` (schema 1: flow, devices, steps with waived states, screens with per-device `{file, w, h, sha256, source, layout}` and `includes` (the shared parts flattened in, as `Cmp<Name>` ids), transitions (declared plus inferred from links), `product`, `contentHash` = sha256 over the sorted `screens/<file>=<sha>` lines, `componentsHash`) and `files[]` (`{path, encoding utf8|base64, content}`; paths `screens/<id>[-Mobile].html`, optional `png/*.png`). Screens are named by their id whatever the source file was called. The server recomputes every hash.

### Journey map

The portal draws the project's flows as a left-to-right map. `manifest.flow.order` (integer, from `flow.json.order`) places the flow; `manifest.flow.next` (`[{flow: <sibling slug>, on: <trigger label>}]`, from `flow.json.next`) draws the arrows. Both are stored on the flow at every push, including a push whose content hash is reused, so changing them never creates a version. Staff can reorder in the portal; `portal.mjs pull` writes the portal's position back into `flow.json.order` and reports `orderChanged`. Connections are only edited in the repository.

## Text edits (customer copy suggestions)

A served screen includes a bridge script. The web app tells it to enable editing; the customer changes a text and presses Enter; the bridge posts `{elementPath (b/i/j/…), originalText, originalHash (djb2 of the normalized text), newText, componentRef}`; the app stores a pending edit. Every view of that screen applies pending edits on load, so the canvas and the prototype agree by construction. The plugin pulls edits, applies them to the source (`portal.mjs edits apply`: the screen file, or the include that holds the text, plus the other device variant when the text is unique there), and the next publish marks them `applied` in that version.

## MCP tools

`list_projects`, `list_flows`, `get_flow_head`, `get_version_manifest`, `push_flow_version`, `push_components`, `list_comments`, `reply_to_thread`, `resolve_thread`, `list_text_edits`, `mark_text_edits_applied`, `list_releases`, `get_release`, `create_release`, `get_states_grid`, `waive_state`, `list_handoffs`, `get_handoff`, `create_handoff`, `read_docs`. Tool calls carry the token's project permissions (a viewer token cannot push). Claude Code config (`setup` writes it; the token is expanded from the environment, never literal):

```json
{
  "mcpServers": {
    "designli-portal": {
      "type": "http",
      "url": "https://portal.designli.co/mcp",
      "headers": { "Authorization": "Bearer ${DESIGNLI_PORTAL_TOKEN}" }
    }
  }
}
```
