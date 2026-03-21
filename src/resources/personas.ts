import { readdir, readFile } from 'fs/promises';
import { extname } from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ListResourcesResult } from '@modelcontextprotocol/sdk/types.js';
import { safeResolve } from '../utils/paths.js';

const PERSONA_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.json']);
const PERSONAS_PATH = ['.claude', 'agents'] as const;

function mimeTypeForExt(ext: string): string {
  if (ext === '.md') return 'text/markdown';
  if (ext === '.json') return 'application/json';
  return 'text/yaml';
}

/**
 * Registers read-only MCP resources for VPC personas.
 * URI pattern: specrails://personas/{name}  (name includes file extension)
 */
export function registerPersonasResources(server: McpServer, projectRoot: string): void {
  const personasDir = safeResolve(projectRoot, ...PERSONAS_PATH);

  const template = new ResourceTemplate('specrails://personas/{name}', {
    list: async (): Promise<ListResourcesResult> => {
      let files: string[];
      try {
        files = await readdir(personasDir);
      } catch {
        files = [];
      }
      return {
        resources: files
          .filter((f) => PERSONA_EXTENSIONS.has(extname(f)))
          .map((f) => ({
            uri: `specrails://personas/${f}`,
            name: f,
            mimeType: mimeTypeForExt(extname(f)),
            description: `VPC persona: ${f}`,
          })),
      };
    },
  });

  server.resource(
    'persona',
    template,
    { description: 'VPC persona definition file' },
    async (uri, variables) => {
      const raw = variables['name'];
      const name = Array.isArray(raw) ? raw[0] : raw;
      if (!name || /[/\\]/.test(name)) {
        throw new Error(`Invalid persona name: "${String(name)}"`);
      }
      const filePath = safeResolve(projectRoot, ...PERSONAS_PATH, name);
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
