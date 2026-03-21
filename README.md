# specrails-mcp

MCP server that exposes specrails-core knowledge — specs, personas, agent memory, and project config — to any MCP-compatible client (Claude, Cursor, Copilot Chat, etc.).

## Features

- **Spec resources**: read OpenSpec specs and change history
- **Persona resources**: access VPC (Value Proposition Canvas) personas
- **Memory resources**: query agent memory entries
- **Config resources**: read project config (`CLAUDE.md`, `openspec/config.yaml`)
- **Doctor tool**: health-check that validates the specrails-core project structure
- **Safe read-only access**: path traversal prevention, no filesystem writes

## Installation

```bash
npm install -g specrails-mcp
```

Or use directly with `npx`:

```bash
npx specrails-mcp
```

## Usage

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "specrails": {
      "command": "specrails-mcp",
      "env": {
        "SPECRAILS_ROOT": "/path/to/your/specrails-core"
      }
    }
  }
}
```

### Environment Variables

| Variable          | Required | Description                                |
| ----------------- | -------- | ------------------------------------------ |
| `SPECRAILS_ROOT`  | Yes      | Absolute path to the specrails-core project root |

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Build
npm run build
```

## Architecture

```
src/
├── index.ts              # Entry point, server bootstrap
├── server.ts             # MCP server configuration
├── resources/            # MCP resource handlers
│   ├── specs.ts          # OpenSpec specs
│   ├── changes.ts        # OpenSpec changes
│   ├── personas.ts       # VPC personas
│   ├── config.ts         # Project config
│   ├── memory.ts         # Agent memory
│   ├── skills.ts         # Provider-agnostic SKILL.md skills
│   └── provider-info.ts  # Provider detection info
├── tools/                # MCP tool handlers
│   ├── doctor.ts         # Health check tool
│   ├── score-feature.ts  # VPC scoring tool
│   └── query-failures.ts # Failure analysis tool
└── utils/
    ├── paths.ts          # Safe path resolution
    ├── validation.ts     # Input validation
    └── provider.ts       # AI provider detection (Claude/Codex)
```

## License

MIT
