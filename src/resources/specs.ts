import { readdir, readFile } from 'fs/promises';
import { extname } from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ListResourcesResult } from '@modelcontextprotocol/sdk/types.js';
import { safeResolve } from '../utils/paths.js';

const SPEC_EXTENSIONS = new Set(['.yaml', '.yml', '.json', '.md']);
const SPECS_PATH = ['openspec', 'specs'] as const;

function mimeTypeForExt(ext: string): string {
  if (ext === '.md') return 'text/markdown';
  if (ext === '.json') return 'application/json';
  return 'text/yaml';
}

/**
 * Registers read-only MCP resources for OpenSpec specs.
 * URI pattern: specrails://specs/{name}  (name includes file extension)
 */
export function registerSpecsResources(server: McpServer, projectRoot: string): void {
  const specsDir = safeResolve(projectRoot, ...SPECS_PATH);

  const template = new ResourceTemplate('specrails://specs/{name}', {
    list: async (): Promise<ListResourcesResult> => {
      let files: string[];
      try {
        files = await readdir(specsDir);
      } catch {
        files = [];
      }
      return {
        resources: files
          .filter((f) => SPEC_EXTENSIONS.has(extname(f)))
          .map((f) => ({
            uri: `specrails://specs/${f}`,
            name: f,
            mimeType: mimeTypeForExt(extname(f)),
            description: `OpenSpec specification: ${f}`,
          })),
      };
    },
  });

  server.resource(
    'spec',
    template,
    { description: 'OpenSpec specification file' },
    async (uri, variables) => {
      const raw = variables['name'];
      const name = Array.isArray(raw) ? raw[0] : raw;
      if (!name || /[/\\]/.test(name)) {
        throw new Error(`Invalid spec name: "${String(name)}"`);
      }
      const filePath = safeResolve(projectRoot, ...SPECS_PATH, name);
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
