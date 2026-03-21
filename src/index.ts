#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { getProjectRoot } from './utils/paths.js';

async function main(): Promise<void> {
  const projectRoot = getProjectRoot();
  const server = createServer(projectRoot);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  process.stderr.write(`specrails-mcp server started (stdio) — root: ${projectRoot}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
