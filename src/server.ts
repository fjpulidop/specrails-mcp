import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecsResources } from './resources/specs.js';
import { registerChangesResources } from './resources/changes.js';
import { registerConfigResources } from './resources/config.js';
import { registerPersonasResources } from './resources/personas.js';
import { registerMemoryResources } from './resources/memory.js';

export const SERVER_NAME = 'specrails-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * Creates and configures the MCP server instance.
 * Registers all read-only resources scoped to the given project root.
 */
export function createServer(projectRoot: string): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerSpecsResources(server, projectRoot);
  registerChangesResources(server, projectRoot);
  registerConfigResources(server, projectRoot);
  registerPersonasResources(server, projectRoot);
  registerMemoryResources(server, projectRoot);

  return server;
}
