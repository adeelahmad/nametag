# Nametag Assistant

A claude.ai-style chat interface layered on top of Nametag. The assistant has
tools to read and write your contacts, journal, groups, and upcoming events,
and can be reached from the web UI, from any chat platform via
[matterbridge](https://github.com/42wim/matterbridge), or from any MCP client
(Claude Desktop, VS Code, Cursor, etc.).

## Features

- Streaming chat with markdown rendering (Enter to send, Shift-Enter for newline).
- Persistent history per user with rename, pin, delete, and per-conversation
  token counters.
- **Auto-compaction**: when a conversation fills up the configured context
  window, the oldest turns are rolled into a rolling summary (same pattern as
  claude.ai's auto-compact).
- **Tool use** / agentic loop: the assistant can call `list_people`,
  `get_person`, `update_person_notes`, `update_last_contact`,
  `create_journal_entry`, `search_journal`, `list_groups`,
  `upcoming_events`, and `current_time`. More can be added in
  `lib/assistant/tools.ts`.
- **Configurable provider**: works against any OpenAI-compatible API
  (OpenAI, Azure, OpenRouter, Groq, Together, Mistral, Ollama, LM Studio,
  llama.cpp) or the native Anthropic Messages API. Base URL, model, API key,
  max tokens, and temperature are all per-user.
- **MCP server** at `/api/mcp` — exposes the same tool registry over
  JSON-RPC 2.0 so Claude Desktop and other MCP clients can drive Nametag.
- **Matter-bridge webhook** at `/api/assistant/bridge` — a simple
  `POST {text}` interface authenticated by a bearer token, compatible with
  matterbridge's generic webhook transport.

## Configuration

Open `Settings → Assistant`. Pick a preset (OpenAI, OpenRouter, Groq, Ollama,
Anthropic) or fill in the base URL manually. API keys are AES-256-GCM
encrypted using the app's `NEXTAUTH_SECRET` (same primitive used for CardDAV).

Recommended defaults:

| Provider | Base URL | Example model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-5` |

## Bridge tokens

Create a bridge token in `Settings → Assistant → Bridge tokens`. The raw
token is shown once; only a SHA-256 hash is stored. Scopes:

- `*` – both chat and MCP
- `chat` – matter-bridge / webhook only
- `mcp` – MCP only

## MCP (Model Context Protocol)

The endpoint at `POST /api/mcp` speaks JSON-RPC 2.0 and supports:

- `initialize`
- `tools/list`
- `tools/call`
- `ping`

Authentication: `Authorization: Bearer <nmt_...>`.

### Claude Desktop configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%AppData%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "nametag": {
      "transport": {
        "type": "http",
        "url": "https://your-nametag.example.com/api/mcp",
        "headers": {
          "Authorization": "Bearer nmt_your_token_here"
        }
      }
    }
  }
}
```

## Matter-bridge integration

Use matterbridge's `api` protocol (generic webhook).

### 1. Create a bridge token in `Settings → Assistant`

### 2. Configure matterbridge

```toml
# matterbridge.toml
[api.nametag]
BindAddress = "0.0.0.0:4242"
Buffer = 1000
RemoteNickFormat = "{NICK}: "
Token = ""   # (unused here; the bearer goes the other direction)

[[gateway]]
name = "nametag"
enable = true

  [[gateway.inout]]
  account = "api.nametag"
  channel = "api"

  [[gateway.inout]]
  account = "slack.mywork"
  channel = "assistant"
```

### 3. Bridge to Nametag's webhook

Use a tiny relay (supervised by matterbridge's API consumer) or the built-in
HTTP forwarder. Example Node relay:

```js
// nametag-relay.js
import http from 'node:http';

const MATTERBRIDGE_URL = 'http://localhost:4242/api/messages';
const NAMETAG_URL = 'https://your-nametag.example.com/api/assistant/bridge';
const TOKEN = process.env.NAMETAG_TOKEN;

async function poll() {
  const res = await fetch(`${MATTERBRIDGE_URL}/stream`);
  const reader = res.body.getReader();
  // ... read each matterbridge message as JSON
  //     forward to Nametag and post response back
}
poll();
```

Or, simpler: point matterbridge's `webhook` transport directly at
`/api/assistant/bridge` for outbound-only relaying (user → Nametag) and a
second matterbridge `webhook` URL on your side for inbound (Nametag →
channel).

### Request shape

```http
POST /api/assistant/bridge
Authorization: Bearer nmt_...
Content-Type: application/json

{
  "text": "Remind me what Alice's birthday is",
  "username": "your_external_username",
  "channel": "#assistant",
  "gateway": "nametag"
}
```

Response:

```json
{
  "conversationId": "clxyz...",
  "text": "Alice's birthday is on March 14.",
  "username": "Nametag Assistant"
}
```

Conversations are keyed by `gateway:channel:username`, so the same chat
participant reuses the same history across messages.

## Adding your own tools

Tools live in `lib/assistant/tools.ts`. Each tool is:

```ts
const myTool: RegisteredTool = {
  definition: {
    name: 'my_tool',
    description: 'What this does.',
    parameters: { type: 'object', properties: { ... }, required: [...] },
  },
  argsSchema: z.object({ ... }),
  async handler(args, ctx) {
    // ctx.userId is the authenticated user
    return { ... };
  },
};
```

Register it in `REGISTRY`. It is automatically surfaced to:

- the assistant's agent loop,
- the MCP endpoint,
- the matter-bridge webhook.

## Data model

See `prisma/schema.prisma` — models: `AssistantSettings`,
`AssistantConversation`, `AssistantMessage`,
`AssistantConversationSummary`, `AssistantBridgeToken`.
