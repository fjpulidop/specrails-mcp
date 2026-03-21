import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecsResources } from './resources/specs.js';
import { registerChangesResources } from './resources/changes.js';
import { registerConfigResources } from './resources/config.js';
import { registerPersonasResources } from './resources/personas.js';
import { registerMemoryResources } from './resources/memory.js';
import { registerSkillsResources } from './resources/skills.js';
import { registerProviderInfoResource } from './resources/provider-info.js';
import { registerHubProjectsResources } from './resources/hub-projects.js';
import { registerHubJobsResources } from './resources/hub-jobs.js';
import { registerHubAnalyticsResources } from './resources/hub-analytics.js';
import { registerDoctorTool } from './tools/doctor.js';
import { registerHubStatusTool } from './tools/hub-status.js';
import { registerHubGetProjectsTool } from './tools/hub-get-projects.js';
import { registerHubGetJobsTool } from './tools/hub-get-jobs.js';
import { registerHubGetAnalyticsTool } from './tools/hub-get-analytics.js';
import { registerHubEnqueueJobTool } from './tools/hub-enqueue-job.js';

export const SERVER_NAME = 'specrails-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * Creates and configures the MCP server instance.
 * Registers all read-only resources scoped to the given project root.
 * Also registers specrails-hub resources and tools (read from ~/.specrails SQLite databases).
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

  // specrails-hub resources (read from ~/.specrails SQLite)
  registerHubProjectsResources(server);
  registerHubJobsResources(server);
  registerHubAnalyticsResources(server);

  // Tools
  registerDoctorTool(server, projectRoot);
  registerHubStatusTool(server);
  registerHubGetProjectsTool(server);
  registerHubGetJobsTool(server);
  registerHubGetAnalyticsTool(server);
  registerHubEnqueueJobTool(server);

  return server;
}
