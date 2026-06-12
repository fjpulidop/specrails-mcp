import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDesktopDb, queryProjects, getDesktopApiBase } from '../desktop/db.js';

export interface DesktopStatusResult {
  desktopDbExists: boolean;
  projectCount: number;
  serverReachable: boolean;
  serverUrl: string;
  pidFileExists: boolean;
  pid: number | null;
}

export async function getDesktopStatus(): Promise<DesktopStatusResult> {
  const pidPath = path.join(os.homedir(), '.specrails', 'manager.pid');
  const serverUrl = getDesktopApiBase();

  let desktopDbExists = false;
  let projectCount = 0;
  try {
    const db = openDesktopDb();
    desktopDbExists = true;
    const projects = queryProjects(db);
    projectCount = projects.length;
    db.close();
  } catch {
    desktopDbExists = false;
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
    // GET /api/state is auth-protected on the desktop server (Bearer or
    // X-Desktop-Token header), so this unauthenticated probe gets a 401 from a
    // running server — and a pre-rebrand desktop (which only served
    // /api/hub/state) answers 404. Either way, ANY HTTP response proves a
    // server is listening on the port, so a resolved fetch counts as
    // reachable; only a network-level failure (connection refused, timeout)
    // counts as down. This also makes a separate legacy /api/hub/state probe
    // unnecessary.
    await fetch(`${serverUrl}/api/state`, {
      signal: AbortSignal.timeout(3_000),
    });
    serverReachable = true;
  } catch {
    serverReachable = false;
  }

  return {
    desktopDbExists,
    projectCount,
    serverReachable,
    serverUrl,
    pidFileExists,
    pid,
  };
}

export function registerDesktopStatusTool(server: McpServer): void {
  server.tool(
    'desktop_status',
    'Check if the Specrails Desktop server is running, how many projects are registered, and overall health',
    {},
    async () => {
      const status = await getDesktopStatus();
      const lines: string[] = ['## Specrails Desktop Status\n'];
      lines.push(`- **Desktop DB**: ${status.desktopDbExists ? '✅ exists' : '❌ not found'}`);
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
