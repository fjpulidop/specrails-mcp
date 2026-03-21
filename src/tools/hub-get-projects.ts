import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { openHubDb, queryProjects, queryProjectById } from '../hub/db.js';
import type { ProjectRow } from '../hub/types.js';

export interface GetProjectsResult {
  projects: Array<Omit<ProjectRow, never>>;
}

export function getProjects(): GetProjectsResult {
  const db = openHubDb();
  try {
    return { projects: queryProjects(db) };
  } finally {
    db.close();
  }
}

export function getProject(projectId: string): ProjectRow {
  const db = openHubDb();
  try {
    const project = queryProjectById(db, projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  } finally {
    db.close();
  }
}

export function registerHubGetProjectsTool(server: McpServer): void {
  server.tool('list_projects', 'List all projects registered in specrails-hub', {}, () => {
    const result = getProjects();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  });

  server.tool(
    'get_project',
    'Get details for a specific project by ID',
    {
      projectId: z.string().describe('Project ID from list_projects'),
    },
    ({ projectId }) => {
      const result = getProject(projectId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
