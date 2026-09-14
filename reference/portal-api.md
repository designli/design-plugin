# Design portal API contract

Implemented by `design-portal` (Bun + Hono + Drizzle + PostgreSQL). The plugin talks to it through `scripts/portal.mjs`; other agents through the MCP server at `/mcp`. Base URL from `design/library.json.publish.portal.url` or `DESIGNLI_PORTAL_URL`. All paths below are under `/api/v1` unless noted.

## Auth

- Designers and agents: `Authorization: Bearer dpat_…` (personal access token; the seed prints one, the portal will issue them per user). Add `X-Designli-On-Behalf: agent` on writes made by an agent so the portal records the author as "Claude (designli-design)" with role `agent`.
- Customers: a share link `/s/<token>` plus the project's access code opens a cookie session (`POST /share/:token/session {code, name}`); the session can read the project, comment and suggest copy edits, never push or see other projects.
- Web sessions for designers: `POST /session {token}` sets the same cookie from a token.
- Token lookup in `portal.mjs`: `--token` flag, then `DESIGNLI_PORTAL_TOKEN`, then `~/.config/designli-design/credentials.json` (0600). Never in a repo.

## Information architecture

Project → User flows (versioned) + one project-level Components library (versioned). Everything a customer sees belongs to one project.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | user + memberships, or `share` for a customer session |
| GET / POST | `/projects` | slug ids; `{id, name, accessCode?}`; 409 `PROJECT_EXISTS` |
| GET | `/projects/:p` | flows + latest components version |
| PUT | `/projects/:p/access-code` | `{code}` |
| GET | `/projects/:p/flows`; PUT `/projects/:p/flows/:f` | upsert title/goal |
| GET | `/projects/:p/flows/:f/head` | `{version, contentHash, openThreads, pendingEdits, lastActivityAt}`; call before a push |
| POST | `/projects/:p/flows/:f/versions` | bundle envelope `{manifest, files[]}` (gzip accepted). Headers: `If-Match: <head version you last synced>` (0 for a new flow), `X-Designli-Last-Pull: <ISO of your last pull>`. 201 new version, 200 `reused: true` on an identical content hash, 409 `STALE_LOCAL` when the head moved or comments/edits were updated after your last pull (`?force=1` overrides), 422 `HASH_MISMATCH` / `VALIDATION`, 413 `BUNDLE_TOO_LARGE` (20 MB) |
| GET | `/projects/:p/flows/:f/versions[/:v]` | list, or manifest of `v` (`latest` allowed) |
| POST / GET | `/projects/:p/components/versions[/:v]` | components bundle (`manifest.kind = components`), idempotent by hash |
| GET | `/projects/:p/flows/:f/comments` | `?status=open|resolved|all&since&screen&device&version&sentToAgent` → `{threads, serverTime}` |
| POST | `/projects/:p/flows/:f/comments` | `{screen:{id,device}|null, anchor:{x,y}?, text, flowVersion?}` |
| POST | `…/comments/:t/replies` `{text}`; `…/:t/resolve`; `…/:t/reopen`; PATCH `…/:t {sentToAgent}` | |
| GET | `/projects/:p/flows/:f/text-edits` | `?status=pending|applied|dismissed|all&screen&device` → `{edits}` |
| POST | `/projects/:p/flows/:f/text-edits` | from the canvas: `{screen, elementPath, componentRef?, originalText, originalHash, newText, flowVersion?}`; one pending edit per element per version (newer supersedes) |
| PATCH | `…/text-edits/:id {status}`; POST `…/text-edits/mark-applied {ids, version}` | |
| POST / GET / DELETE | `/projects/:p/share-links[/:id]` | `{flowId?, expiresInDays?}` → `{url}` |
| GET | `/share/:token`; POST `/share/:token/session {code, name}` | public; 404 unknown, 410 expired, 401 wrong code |
| GET | `/p/:p/:f/v:n/manifest.json`, `/p/:p/:f/v:n/screens/:file` (`latest` allowed), `/p/:p/components/v:n/…` | served screens carry the editor bridge; `?raw=1` returns the stored file |
| POST | `/mcp` (not under `/api/v1`) | streamable-HTTP JSON-RPC: `initialize`, `tools/list`, `tools/call` with a bearer token |

Errors: `{error: {code, message, details}}` with codes `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `PROJECT_EXISTS` 409, `STALE_LOCAL` 409, `GONE` 410, `BUNDLE_TOO_LARGE` 413, `VALIDATION` / `HASH_MISMATCH` 422, `RATE_LIMITED` 429, `INTERNAL` 500.

## Bundle envelope

Produced by `scripts/bundle.mjs`: `manifest.json` (schema 1: flow, devices, steps with waived states, screens with per-device `{file, w, h, sha256, layout}`, transitions, `contentHash` = sha256 over the sorted `screens/<file>=<sha>` lines, `componentsHash`) and `files[]` (`{path, encoding utf8|base64, content}`; paths `screens/*.html`, optional `png/*.png`). The server recomputes every hash.

## Text edits (customer copy suggestions)

A served screen includes a bridge script. The web app tells it to enable editing; the customer changes a text and presses Enter; the bridge posts `{elementPath (b/i/j/…), originalText, originalHash (djb2 of the normalized text), newText, componentRef}`; the app stores a pending edit. Every view of that screen applies pending edits on load, so the canvas and the prototype agree by construction. The plugin pulls edits, applies them to the `.dc.html` sources (`portal.mjs edits apply`, both device variants when the text is unique in each), and the next push marks them `applied` in that version.

## MCP tools

`list_projects`, `list_flows`, `get_flow_head`, `get_version_manifest`, `push_flow_version`, `push_components`, `list_comments`, `reply_to_thread`, `resolve_thread`, `list_text_edits`, `mark_text_edits_applied`, `create_share_link`. Claude Code config:

```json
{ "mcpServers": { "design-portal": { "type": "http", "url": "http://localhost:8787/mcp", "headers": { "Authorization": "Bearer dpat_…" } } } }
```
