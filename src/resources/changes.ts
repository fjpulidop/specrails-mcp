import { readdir, readFile } from 'fs/promises';
import { extname } from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ListResourcesResult } from '@modelcontextprotocol/sdk/types.js';
import { safeResolve } from '../utils/paths.js';

const CHANGE_EXTENSIONS = new Set(['.yaml', '.yml', '.json', '.md']);
const CHANGES_PATH = ['openspec', 'changes'] as const;

function mimeTypeForExt(ext: string): string {
  if (ext === '.md') return 'text/markdown';
  if (ext === '.json') return 'application/json';
  return 'text/yaml';
}

/**
 * Registers read-only MCP resources for OpenSpec change records.
 * URI pattern: specrails://changes/{name}  (name includes file extension)
 */
export function registerChangesResources(server: McpServer, projectRoot: string): void {
  const changesDir = safeResolve(projectRoot, ...CHANGES_PATH);

  const template = new ResourceTemplate('specrails://changes/{name}', {
    list: async (): Promise<ListResourcesResult> => {
      let files: string[];
      try {
        files = await readdir(changesDir);
      } catch {
        files = [];
      }
      return {
        resources: files
          .filter((f) => CHANGE_EXTENSIONS.has(extname(f)))
          .map((f) => ({
            uri: `specrails://changes/${f}`,
            name: f,
            mimeType: mimeTypeForExt(extname(f)),
            description: `OpenSpec change record: ${f}`,
          })),
      };
    },
  });

  server.resource(
    'change',
    template,
    { description: 'OpenSpec change record file' },
    async (uri, variables) => {
      const raw = variables['name'];
      const name = Array.isArray(raw) ? raw[0] : raw;
      if (!name || /[/\\]/.test(name)) {
        throw new Error(`Invalid change name: "${String(name)}"`);
      }
      const filePath = safeResolve(projectRoot, ...CHANGES_PATH, name);
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
