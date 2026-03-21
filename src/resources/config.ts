import { readFile } from 'fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { safeResolve } from '../utils/paths.js';
import { detectProvider, instructionsFileName } from '../utils/provider.js';

const STATIC_CONFIG_FILES = [
  {
    uri: 'specrails://config/openspec',
    name: 'openspec-config',
    path: ['openspec', 'config.yaml'],
    mimeType: 'text/yaml',
    description: 'OpenSpec project configuration (openspec/config.yaml)',
  },
] as const;

/**
 * Registers read-only MCP resources for project config files.
 * Static resources: specrails://config/openspec
 * Dynamic resource: specrails://config/instructions (CLAUDE.md or CODEX.md based on active provider)
 */
export function registerConfigResources(server: McpServer, projectRoot: string): void {
  for (const cfg of STATIC_CONFIG_FILES) {
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

  // Provider-aware instructions file (CLAUDE.md for claude, CODEX.md for codex)
  server.resource(
    'instructions',
    'specrails://config/instructions',
    {
      mimeType: 'text/markdown',
      description: 'Agent instructions file (CLAUDE.md or CODEX.md based on active CLI provider)',
    },
    async (resourceUri) => {
      const { provider } = await detectProvider(projectRoot);
      const fileName = instructionsFileName(provider);
      const filePath = safeResolve(projectRoot, fileName);
      const content = await readFile(filePath, 'utf-8');
      return {
        contents: [
          {
            uri: resourceUri.toString(),
            text: content,
            mimeType: 'text/markdown',
          },
        ],
      };
    },
  );
}
