# Obsidian Vault MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes CRUD
operations on any WebDAV endpoint as MCP tools. It lets Claude Desktop, Claude Code,
and other MCP clients — including remote ones, via OAuth — read, write, and organize
files on a WebDAV file system through natural language. Built to give AI agents
controlled access to Obsidian vaults stored remotely (Koofr, Nextcloud, etc.) — a
generic WebDAV server underneath, since a vault is just a folder of Markdown files.

Originally forked from [LaubPlusCo/mcp-webdav-server](https://github.com/LaubPlusCo/mcp-webdav-server);
this fork adds OAuth 2.1 support, a Streamable HTTP transport, and hardening for
running as a persistent remote server (tested against [Koofr](https://koofr.eu) and
deployed on [Railway](https://railway.app)).

Currently running as **two independent deployments** from this same codebase, each
pointed at a different [Obsidian](https://obsidian.md) vault in Koofr and connected to
Claude as a separate Connector:

- **Agent Vault** — a freeform folder where AI agents write/experiment without
  restrictions (`master` branch).
- **Obsidian Vault** — a curated personal vault, plus [Anna's Archive](https://annas-archive.gl)
  book/article search tools (`annas-archive` branch).

See [Running multiple instances](#running-multiple-instances) below for how that's set up.

## Why

I wanted to read, create, and edit notes in my Obsidian vault — stored in Koofr, which
speaks WebDAV — from anywhere: Claude Code on my machine, and eventually a chat bot on
my phone (Telegram/WhatsApp). An Obsidian vault is just a folder of Markdown files, so a
generic WebDAV MCP server is enough: no Obsidian-specific concepts (tags, backlinks,
semantic search) are needed to read and write notes, only file CRUD. See
[REMOTE_CONNECTION.md](REMOTE_CONNECTION.md) for the exact connection flow this enables.

## Features

- Connect to any WebDAV server (Koofr, Nextcloud, generic WebDAV, etc.)
- Full CRUD: create, read, update, delete, move, copy, list files and directories
- Two transports:
  - **stdio** — for local clients like Claude Desktop
  - **Streamable HTTP** (`/mcp`) — for remote clients, one MCP server instance per session
- **OAuth 2.1** authorization (authorization code + PKCE, Dynamic Client Registration)
  for the remote HTTP endpoint, so it can be added as a "Connector" in Claude Code /
  claude.ai without manual token wrangling
- Optional bcrypt-hashed passwords for the OAuth login (WebDAV passwords must stay
  plain text — the protocol requires it)
- WebDAV connection pooling
- Configuration validated with Zod
- Structured logging, with a `LOG_LEVEL=debug` mode that traces every tool call

## Prerequisites

- Node.js 20 or later
- npm
- A WebDAV server or account (Koofr, Nextcloud, `hacdias/webdav`, etc.)

## Installation

```bash
git clone https://github.com/joaquin-her/obsidian-vault-mcp.git
cd obsidian-vault-mcp
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and fill in your WebDAV details:

```env
# WebDAV configuration
WEBDAV_ROOT_URL=https://app.koofr.net/dav/Koofr
WEBDAV_ROOT_PATH=/MyVault
WEBDAV_AUTH_ENABLED=true
WEBDAV_USERNAME=you@example.com
WEBDAV_PASSWORD=your-koofr-app-password

# HTTP mode only
SERVER_PORT=3000
PUBLIC_URL=https://your-server.example.com

# OAuth login credentials for /mcp (single-user)
AUTH_ENABLED=true
AUTH_USERNAME=user
AUTH_PASSWORD=pass

# Name shown to MCP clients and on /health (defaults to "Agent Vault")
MCP_SERVER_NAME=Agent Vault
```

See [.env.example](.env.example) for the full list, including bcrypt password hashing
and `LOG_LEVEL`.

## Usage

### stdio (local, e.g. Claude Desktop)

```bash
node dist/index.js
```

### Streamable HTTP with OAuth (remote clients)

```bash
node dist/index.js --http
```

This starts an Express server exposing `/mcp` (the MCP endpoint) plus the OAuth
endpoints (`/authorize`, `/token`, `/register`, and the `/.well-known/...` discovery
routes). See [REMOTE_CONNECTION.md](REMOTE_CONNECTION.md) for how to add this as a
Connector in Claude Code, or how a bot can drive the OAuth flow programmatically.

On platforms like Railway, the app listens on `process.env.PORT` (falling back to
`SERVER_PORT`), and infers its public URL from `RAILWAY_PUBLIC_DOMAIN` unless
`PUBLIC_URL` is set explicitly.

## Integrating with Claude Desktop (stdio)

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webdav": {
      "command": "node",
      "args": ["<path-to-repo>/dist/index.js"],
      "env": {
        "WEBDAV_ROOT_URL": "<WEBDAV_ROOT_URL>",
        "WEBDAV_ROOT_PATH": "<WEBDAV_ROOT_PATH>",
        "WEBDAV_USERNAME": "<WEBDAV_USERNAME>",
        "WEBDAV_PASSWORD": "<WEBDAV_PASSWORD>",
        "WEBDAV_AUTH_ENABLED": "true"
      }
    }
  }
}
```

## Connecting remotely (Claude Code, bots)

For a deployed instance (e.g. on Railway), add it as a Connector using its `/mcp`
URL — the OAuth flow (discovery, registration, login, token) happens automatically.
Full details, including a reference flow for bots that need to drive OAuth
programmatically (Telegram/WhatsApp intermediaries), are in
[REMOTE_CONNECTION.md](REMOTE_CONNECTION.md).

### Persisting OAuth state across restarts

Registered OAuth clients and issued tokens are written to a JSON file at
`STATE_FILE_PATH` (default `/data/oauth-state.json`) every time a client
registers or a token is issued/revoked. Without a real persistent volume
mounted at that path, this file lives on the container's ephemeral
filesystem and is lost on every restart/redeploy — meaning every deploy
would otherwise force a full OAuth re-login in Claude Code or any
connected bot.

On Railway: create a **Volume** for the service (Settings → Volumes) with
mount path `/data`. Railway rejects a Docker `VOLUME` instruction in the
Dockerfile itself (the build fails with *"docker VOLUME ... is not
supported, use Railway Volumes"*), so the volume must be created from the
dashboard or via the [Railway API](https://docs.railway.com/reference/public-api),
not declared in the Dockerfile.

On a plain Docker host: mount a volume at `/data`, e.g.
`docker run -v webdav-mcp-data:/data ...`.

Token lifetimes (hardcoded in `src/auth/single-user-oauth-provider.ts`):

| Item | Lifetime | Persisted? |
|---|---|---|
| Access token | 1 hour | Yes |
| Refresh token | 30 days | Yes |
| Authorization code | 5 minutes | No (in-memory only, always mid-flow) |
| Registered OAuth client | Never expires | Yes |

Authorization codes and in-flight login sessions are intentionally kept
in-memory only — they live minutes at most and are always tied to a
request in progress, so losing them on a restart just means retrying that
one login rather than a real regression.

### Running multiple instances

Nothing in this server hardcodes a single deployment — the same repo/Dockerfile
can back several independent instances, each pointed at a different
`WEBDAV_ROOT_PATH` (e.g. one folder for freeform agent-generated content, another
for a curated personal vault), by deploying it as separate services (Railway or
otherwise) with different env vars:

- `WEBDAV_ROOT_PATH` (and `WEBDAV_ROOT_URL`/credentials, if they differ)
- `MCP_SERVER_NAME`, so each instance identifies itself distinctly to clients
- `AUTH_USERNAME`/`AUTH_PASSWORD`, so each has its own OAuth login
- A separate persistent volume mounted at `/data` (`STATE_FILE_PATH`) per
  instance, so their registered OAuth clients/tokens don't collide

`PUBLIC_URL` doesn't need to be set explicitly in this case — each Railway
service gets its own domain via `RAILWAY_PUBLIC_DOMAIN` automatically. Add each
instance as a separate Connector in Claude Code to have both available at once.

## Available MCP Tools

- `webdav_list_remote_directory` — list files and directories at a path
- `webdav_get_remote_file` — read a file's content
- `webdav_create_remote_file` — create a new file
- `webdav_create_remote_files` — create multiple files in one call (e.g. uploading a whole
  folder of notes/images), creating any missing parent directories automatically
- `webdav_update_remote_file` — overwrite an existing file's content
- `webdav_delete_remote_item` — delete a file or directory
- `webdav_create_remote_directory` — create a directory
- `webdav_move_remote_item` — move/rename a file or directory
- `webdav_copy_remote_item` — copy a file or directory

## Example Queries

- "List the files in my vault"
- "Create a note called `2026-07-22.md` with today's summary"
- "Read `Projects/Alpha.md`"
- "Rename `draft.md` to `Ideas/draft.md`"

## Docker

```bash
docker build -t obsidian-vault-mcp .
docker run -p 3000:3000 \
  -e WEBDAV_ROOT_URL=https://app.koofr.net/dav/Koofr \
  -e WEBDAV_ROOT_PATH=/MyVault \
  -e WEBDAV_AUTH_ENABLED=true \
  -e WEBDAV_USERNAME=you@example.com \
  -e WEBDAV_PASSWORD=your-app-password \
  -e AUTH_ENABLED=true \
  -e AUTH_USERNAME=user \
  -e AUTH_PASSWORD=pass \
  obsidian-vault-mcp
```

### Local WebDAV server via Docker Compose

For local testing without a real WebDAV account:

```bash
cd docker
docker-compose up -d
```

This runs [hacdias/webdav](https://github.com/hacdias/webdav) on port 4080
(`admin`/`admin`) alongside the MCP server on port 3000 (`user`/`pass`). Configure it
via `docker/webdav_config.yml`.

## Testing

```bash
npm test
```

## Further reading

- [REMOTE_CONNECTION.md](REMOTE_CONNECTION.md) — OAuth flow, Connector setup, bot
  integration reference
- [PASSWORD_ENCRYPTION.md](PASSWORD_ENCRYPTION.md) — bcrypt password hashing details

## License

MIT
