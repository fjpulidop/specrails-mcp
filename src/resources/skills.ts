import { readdir, readFile, access, constants } from 'fs/promises';
import { join } from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ListResourcesResult } from '@modelcontextprotocol/sdk/types.js';
import { safeResolve } from '../utils/paths.js';
import { detectProvider } from '../utils/provider.js';

/**
 * Registers read-only MCP resources for specrails Skills (SKILL.md format).
 * URI pattern: specrails://skills/{name}  (name = skill directory name)
 * Path: {configDir}/skills/{name}/SKILL.md
 *
 * The configDir is resolved dynamically per-request based on the detected
 * CLI provider (claude → .claude, codex → .codex).
 */
export function registerSkillsResources(server: McpServer, projectRoot: string): void {
  const template = new ResourceTemplate('specrails://skills/{name}', {
    list: async (): Promise<ListResourcesResult> => {
      const { configDir } = await detectProvider(projectRoot);
      const skillsDir = safeResolve(projectRoot, configDir, 'skills');

      let entries: string[];
      try {
        entries = await readdir(skillsDir);
      } catch {
        return { resources: [] };
      }

      const skills: Array<{ uri: string; name: string; mimeType: string; description: string }> =
        [];

      for (const entry of entries) {
        const skillFilePath = join(skillsDir, entry, 'SKILL.md');
        try {
          await access(skillFilePath, constants.R_OK);
          skills.push({
            uri: `specrails://skills/${entry}`,
            name: entry,
            mimeType: 'text/markdown',
            description: `Skill: ${entry}`,
          });
        } catch {
          // Skip directories without SKILL.md
        }
      }

      return { resources: skills };
    },
  });

  server.resource(
    'skill',
    template,
    { description: 'Specrails skill definition (SKILL.md)' },
    async (uri, variables) => {
      const raw = variables['name'];
      const name = Array.isArray(raw) ? raw[0] : raw;
      if (!name || /[/\\]/.test(name)) {
        throw new Error(`Invalid skill name: "${String(name)}"`);
      }

      const { configDir } = await detectProvider(projectRoot);
      const filePath = safeResolve(projectRoot, configDir, 'skills', name, 'SKILL.md');
      const content = await readFile(filePath, 'utf-8');

      return {
        contents: [
          {
            uri: uri.toString(),
            text: content,
            mimeType: 'text/markdown',
          },
        ],
      };
    },
  );
}
