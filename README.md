# specrails-mcp

MCP server that gives AI assistants full access to your [specrails](https://github.com/fjpulidop/specrails-mcp) projects — specs, personas, memory, jobs, analytics, and more.

Works with any MCP-compatible client: Claude Code, Claude Desktop, Cursor, Windsurf, Codex CLI, and others.

```
npm install -g specrails-mcp
```

---

## Quick start

### 1. Add to your MCP client

**Claude Code** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "specrails": {
      "command": "specrails-mcp",
      "args": [],
      "env": {
        "SPECRAILS_PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "specrails": {
      "command": "npx",
      "args": ["-y", "specrails-mcp"],
      "env": {
        "SPECRAILS_PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

### 2. Talk to your AI assistant

```
You: "What projects do I have in specrails?"
AI:  → calls list_projects → shows your registered projects

You: "Run a health-check on DeckDex"
AI:  → calls enqueue_job with command "health-check" → job starts

You: "How much have I spent in the last 7 days?"
AI:  → calls get_analytics with period "7d" → shows cost breakdown
```

That's it. The AI discovers available tools and resources automatically via MCP.

---

## Tools

Eight tools your AI assistant can call:

### Core

| Tool         | Description                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| **`doctor`** | Health check of your specrails installation. Verifies directories, config files, and provider setup. |

### Hub — Query

| Tool                 | Description                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **`hub_status`**     | Is the hub server running? How many projects are registered?                                                               |
| **`list_projects`**  | List all projects registered in specrails-hub.                                                                             |
| **`get_project`**    | Get details for a specific project (path, provider, timestamps).                                                           |
| **`get_jobs`**       | List jobs for a project. Filter by status (`running`, `success`, `failed`, `cancelled`). Supports pagination.              |
| **`get_job_detail`** | Full detail for a specific job — phases, event log, tokens, cost, exit code.                                               |
| **`get_analytics`**  | Cost, job counts, success rates, token usage. Scope to a project or get hub-wide aggregation. Periods: `7d`, `30d`, `all`. |

### Hub — Action

| Tool              | Description                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **`enqueue_job`** | Queue a new AI job in a project. Requires the hub server to be running. Supports model override. |

#### `enqueue_job` parameters

| Parameter   | Required | Description                                       |
| ----------- | -------- | ------------------------------------------------- |
| `projectId` | Yes      | Project ID (get it from `list_projects`)          |
| `command`   | Yes      | Command to run (see below)                        |
| `model`     | No       | Override the AI model (e.g., `"claude-opus-4-6"`) |

#### Known commands

| Command                         | What it does                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| `implement`                     | Implement a specific ticket (e.g., `"implement #42"`)         |
| `health-check`                  | Audit the health of a project                                 |
| `product-backlog`               | Generate/update GitHub Issues for a project's product backlog |
| `update-product-driven-backlog` | Refresh the product-driven backlog                            |

---

## Resources

Read-only data your AI assistant can access via MCP resource URIs.

### Project resources (specrails-core)

Read from the local project directory:

| URI                               | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| `specrails://specs/{name}`        | OpenSpec specification files (YAML, JSON, Markdown)                |
| `specrails://changes/{name}`      | OpenSpec change records                                            |
| `specrails://config/openspec`     | Project configuration (`openspec/config.yaml`)                     |
| `specrails://config/instructions` | Agent instructions file (`CLAUDE.md` or `CODEX.md`, auto-detected) |
| `specrails://personas/{name}`     | VPC persona definitions                                            |
| `specrails://memory/{name}`       | Agent memory files                                                 |
| `specrails://skills/{name}`       | Skill definitions (`SKILL.md`)                                     |
| `specrails://provider`            | Active CLI provider info (claude or codex)                         |

### Hub resources (specrails-hub)

Read from the `~/.specrails` SQLite databases:

| URI                                                 | Description                                         |
| --------------------------------------------------- | --------------------------------------------------- |
| `specrails://hub/projects`                          | All registered projects with metadata               |
| `specrails://hub/projects/{projectId}`              | Single project detail with quick stats              |
| `specrails://hub/projects/{projectId}/jobs`         | Recent jobs (last 50) with status, cost, duration   |
| `specrails://hub/projects/{projectId}/jobs/{jobId}` | Full job detail with event log                      |
| `specrails://hub/analytics`                         | Hub-wide analytics (last 30 days)                   |
| `specrails://hub/projects/{projectId}/analytics`    | Project-specific analytics with daily cost timeline |

---

## Typical workflow

```
hub_status → list_projects → enqueue_job → get_jobs → get_job_detail
   ↓              ↓              ↓             ↓              ↓
"Is it up?"  "What's there?"  "Launch it"  "How's it going?"  "What happened?"
```

### Check system health

```
"Run the specrails doctor"        → doctor
"Is the hub running?"             → hub_status
```

### Discover and inspect projects

```
"What projects do I have?"        → list_projects
"Show me details for DeckDex"     → get_project
```

### Run and monitor jobs

```
"Implement ticket #42 on DeckDex"              → enqueue_job (command: "implement #42")
"Run a health-check on mechboards"             → enqueue_job (command: "health-check")
"Launch product-backlog on DeckDex with opus"   → enqueue_job (model: "claude-opus-4-6")
"What jobs are running right now?"              → get_jobs (status: "running")
"Show me the last 5 failed jobs"               → get_jobs (status: "failed", limit: 5)
"Why did job f496a1b0 fail?"                   → get_job_detail
```

### Track costs and performance

```
"How much has DeckDex cost this week?"         → get_analytics (period: "7d")
"Show me analytics for all projects"           → get_analytics (no projectId)
"What's the success rate for specrails-core?"  → get_analytics
"Which project spent the most this month?"     → get_analytics (period: "30d")
```

---

## Architecture

```
┌─────────────────────┐     stdio      ┌──────────────────────────┐
│   MCP Client        │◄──────────────►│   specrails-mcp          │
│                     │                │                          │
│   Claude Code       │                │   Resources (read-only)  │
│   Claude Desktop    │                │   ├── openspec/          │
│   Cursor            │                │   ├── .claude/ (.codex/) │
│   Windsurf          │                │   └── ~/.specrails DBs   │
│   Codex CLI         │                │                          │
│   ...               │                │   Tools (read + action)  │
│                     │                │   ├── doctor             │
└─────────────────────┘                │   ├── hub queries        │
                                       │   └── enqueue_job → Hub  │
                                       └──────────────────────────┘
```

- **Transport**: stdio (JSON-RPC over stdin/stdout)
- **Resources**: Read-only. Project files + hub SQLite databases.
- **Tools**: Read queries are always safe. `enqueue_job` creates jobs via the hub HTTP API.
- **Provider-aware**: Auto-detects Claude or Codex CLI and reads from the correct config directory.
- **No filesystem writes**: All resource access is strictly read-only with path traversal prevention.

---

## Environment variables

| Variable                 | Default                   | Description                             |
| ------------------------ | ------------------------- | --------------------------------------- |
| `SPECRAILS_PROJECT_ROOT` | Current working directory | Root directory of the specrails project |

> Hub tools connect to `http://localhost:4200` (the default specrails-hub address).

---

## Prerequisites

- **Node.js** >= 20
- **specrails-core** initialized in your project (`openspec/` directory)
- **specrails-hub** running locally (required only for hub tools: `hub_status`, `enqueue_job`, etc.)

---

## Development

```bash
git clone https://github.com/fjpulidop/specrails-mcp.git
cd specrails-mcp
npm install
npm run build
```

| Command                 | Description         |
| ----------------------- | ------------------- |
| `npm run dev`           | Watch mode with tsx |
| `npm test`              | Run tests (Vitest)  |
| `npm run test:coverage` | Coverage report     |
| `npm run lint`          | ESLint              |
| `npm run typecheck`     | TypeScript check    |
| `npm run build`         | Production build    |

---

## License

MIT
