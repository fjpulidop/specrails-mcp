import { readdir, readFile } from 'fs/promises';
import { extname } from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ListResourcesResult } from '@modelcontextprotocol/sdk/types.js';
import { safeResolve } from '../utils/paths.js';
import { detectProvider } from '../utils/provider.js';

const MEMORY_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.json', '.txt']);

function mimeTypeForExt(ext: string): string {
  if (ext === '.md') return 'text/markdown';
  if (ext === '.json') return 'application/json';
  if (ext === '.txt') return 'text/plain';
  return 'text/yaml';
}

/**
 * Registers read-only MCP resources for agent memory files.
 * URI pattern: specrails://memory/{name}  (name includes file extension)
 * Path: {configDir}/agent-memory/{name}  (configDir resolved per-request based on CLI provider)
 */
export function registerMemoryResources(server: McpServer, projectRoot: string): void {
  const template = new ResourceTemplate('specrails://memory/{name}', {
    list: async (): Promise<ListResourcesResult> => {
      const { configDir } = await detectProvider(projectRoot);
      const memoryDir = safeResolve(projectRoot, configDir, 'agent-memory');

      let files: string[];
      try {
        files = await readdir(memoryDir);
      } catch {
        files = [];
      }
      return {
        resources: files
          .filter((f) => MEMORY_EXTENSIONS.has(extname(f)))
          .map((f) => ({
            uri: `specrails://memory/${f}`,
            name: f,
            mimeType: mimeTypeForExt(extname(f)),
            description: `Agent memory file: ${f}`,
          })),
      };
    },
  });

  server.resource(
    'memory',
    template,
    { description: 'Agent memory file' },
    async (uri, variables) => {
      const raw = variables['name'];
      const name = Array.isArray(raw) ? raw[0] : raw;
      if (!name || /[/\\]/.test(name)) {
        throw new Error(`Invalid memory name: "${String(name)}"`);
      }
      const { configDir } = await detectProvider(projectRoot);
      const filePath = safeResolve(projectRoot, configDir, 'agent-memory', name);
      const content = await readFile(filePath, 'utf-8');
      return {
        contents: [
          {
            uri: uri.toString(),
            text: content,
            mimeType: mimeTypeForExt(extname(name)),
          },
        ],
      };
    },
  );
}
