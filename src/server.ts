import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecsResources } from './resources/specs.js';
import { registerChangesResources } from './resources/changes.js';
import { registerConfigResources } from './resources/config.js';
import { registerPersonasResources } from './resources/personas.js';
import { registerMemoryResources } from './resources/memory.js';
import { registerSkillsResources } from './resources/skills.js';
import { registerProviderInfoResource } from './resources/provider-info.js';
import { registerDesktopProjectsResources } from './resources/desktop-projects.js';
import { registerDesktopJobsResources } from './resources/desktop-jobs.js';
import { registerDesktopAnalyticsResources } from './resources/desktop-analytics.js';
import { registerDoctorTool } from './tools/doctor.js';
import { registerDesktopStatusTool } from './tools/desktop-status.js';
import { registerDesktopGetProjectsTool } from './tools/desktop-get-projects.js';
import { registerDesktopGetJobsTool } from './tools/desktop-get-jobs.js';
import { registerDesktopGetAnalyticsTool } from './tools/desktop-get-analytics.js';
import { registerDesktopEnqueueJobTool } from './tools/desktop-enqueue-job.js';

export const SERVER_NAME = 'specrails-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * Creates and configures the MCP server instance.
 * Registers all read-only resources scoped to the given project root.
 * Also registers Specrails Desktop resources and tools (read from ~/.specrails SQLite databases).
 */
export function createServer(projectRoot: string): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // specrails-core resources (project-scoped)
  registerSpecsResources(server, projectRoot);
  registerChangesResources(server, projectRoot);
  registerConfigResources(server, projectRoot);
  registerPersonasResources(server, projectRoot);
  registerMemoryResources(server, projectRoot);
  registerSkillsResources(server, projectRoot);
  registerProviderInfoResource(server, projectRoot);

  // Specrails Desktop resources (read from ~/.specrails SQLite)
  registerDesktopProjectsResources(server);
  registerDesktopJobsResources(server);
  registerDesktopAnalyticsResources(server);

  // Tools
  registerDoctorTool(server, projectRoot);
  registerDesktopStatusTool(server);
  registerDesktopGetProjectsTool(server);
  registerDesktopGetJobsTool(server);
  registerDesktopGetAnalyticsTool(server);
  registerDesktopEnqueueJobTool(server);

  return server;
}
