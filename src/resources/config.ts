import { readFile } from 'fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { safeResolve } from '../utils/paths.js';

const CONFIG_FILES = [
  {
    uri: 'specrails://config/openspec',
    name: 'openspec-config',
    path: ['openspec', 'config.yaml'],
    mimeType: 'text/yaml',
    description: 'OpenSpec project configuration (openspec/config.yaml)',
  },
  {
    uri: 'specrails://config/claude',
    name: 'claude-md',
    path: ['CLAUDE.md'],
    mimeType: 'text/markdown',
    description: 'Claude agent instructions (CLAUDE.md)',
  },
] as const;

/**
 * Registers read-only MCP resources for project config files.
 * Static resources: specrails://config/openspec and specrails://config/claude
 */
export function registerConfigResources(server: McpServer, projectRoot: string): void {
  for (const cfg of CONFIG_FILES) {
    const filePath = safeResolve(projectRoot, ...cfg.path);
    const { uri, name, mimeType, description } = cfg;

    server.resource(name, uri, { mimeType, description }, async (resourceUri) => {
      const content = await readFile(filePath, 'utf-8');
      return {
        contents: [
          {
            uri: resourceUri.toString(),
            text: content,
            mimeType,
          },
        ],
      };
    });
  }
}
