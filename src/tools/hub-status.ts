import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openHubDb, queryProjects, getHubApiBase } from '../hub/db.js';

export interface HubStatusResult {
  hubDbExists: boolean;
  projectCount: number;
  serverReachable: boolean;
  serverUrl: string;
  pidFileExists: boolean;
  pid: number | null;
}

export async function getHubStatus(): Promise<HubStatusResult> {
  const pidPath = path.join(os.homedir(), '.specrails', 'manager.pid');
  const serverUrl = getHubApiBase();

  let hubDbExists = false;
  let projectCount = 0;
  try {
    const db = openHubDb();
    hubDbExists = true;
    const projects = queryProjects(db);
    projectCount = projects.length;
    db.close();
  } catch {
    hubDbExists = false;
  }

  let pidFileExists = false;
  let pid: number | null = null;
  if (fs.existsSync(pidPath)) {
    pidFileExists = true;
    try {
      pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
    } catch {
      // ignore
    }
  }

  let serverReachable = false;
  try {
    const response = await fetch(`${serverUrl}/api/hub/state`, {
      signal: AbortSignal.timeout(3_000),
    });
    serverReachable = response.ok;
  } catch {
    serverReachable = false;
  }

  return {
    hubDbExists,
    projectCount,
    serverReachable,
    serverUrl,
    pidFileExists,
    pid,
  };
}

export function registerHubStatusTool(server: McpServer): void {
  server.tool(
    'hub_status',
    'Check if specrails-hub server is running, how many projects are registered, and overall health',
    {},
    async () => {
      const status = await getHubStatus();
      const lines: string[] = ['## specrails-hub Status\n'];
      lines.push(`- **Hub DB**: ${status.hubDbExists ? '✅ exists' : '❌ not found'}`);
      lines.push(`- **Projects**: ${status.projectCount}`);
      lines.push(
        `- **Server**: ${status.serverReachable ? `✅ reachable at ${status.serverUrl}` : `❌ not reachable at ${status.serverUrl}`}`,
      );
      lines.push(
        `- **PID file**: ${status.pidFileExists ? `✅ exists (PID ${status.pid ?? 'unknown'})` : '❌ not found'}`,
      );
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
