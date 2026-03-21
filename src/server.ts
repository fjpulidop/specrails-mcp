import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const SERVER_NAME = 'specrails-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * Creates and configures the MCP server instance.
 * Resources and tools are registered by their respective modules.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  return server;
}
