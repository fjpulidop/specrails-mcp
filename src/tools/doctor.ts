import { access, readFile, constants } from 'fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { safeResolve } from '../utils/paths.js';
import { detectProvider, instructionsFileName } from '../utils/provider.js';

export interface CheckResult {
  name: string;
  pass: boolean;
  message: string;
}

export interface DoctorResult {
  healthy: boolean;
  provider: string;
  checks: CheckResult[];
}

async function checkDirExists(root: string, ...parts: string[]): Promise<CheckResult> {
  const label = parts.join('/');
  try {
    const p = safeResolve(root, ...parts);
    await access(p, constants.R_OK);
    return { name: label, pass: true, message: `${label}/ exists and is readable` };
  } catch {
    return { name: label, pass: false, message: `${label}/ is missing or not readable` };
  }
}

async function checkFileReadable(root: string, ...parts: string[]): Promise<CheckResult> {
  const label = parts.join('/');
  try {
    const p = safeResolve(root, ...parts);
    const content = await readFile(p, 'utf-8');
    if (content.trim().length === 0) {
      return { name: label, pass: false, message: `${label} exists but is empty` };
    }
    return { name: label, pass: true, message: `${label} exists and is non-empty` };
  } catch {
    return { name: label, pass: false, message: `${label} is missing or not readable` };
  }
}

/**
 * Registers the doctor health-check tool.
 * Returns a structured JSON report of required directories and config files.
 * Checks are provider-aware: uses the detected CLI provider's configDir (.claude or .codex).
 */
export function registerDoctorTool(server: McpServer, projectRoot: string): void {
  server.tool(
    'doctor',
    'Health check for the specrails installation. Verifies required directories and config files.',
    async (): Promise<CallToolResult> => {
      const { provider, configDir } = await detectProvider(projectRoot);
      const instrFile = instructionsFileName(provider);

      const checks = await Promise.all([
        checkDirExists(projectRoot, configDir),
        checkDirExists(projectRoot, 'openspec'),
        checkDirExists(projectRoot, 'openspec', 'specs'),
        checkDirExists(projectRoot, 'openspec', 'changes'),
        checkFileReadable(projectRoot, 'openspec', 'config.yaml'),
        checkFileReadable(projectRoot, instrFile),
      ]);

      const healthy = checks.every((c) => c.pass);
      const result: DoctorResult = { healthy, provider, checks };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !healthy,
      };
    },
  );
}
