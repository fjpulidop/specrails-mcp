import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { openDesktopDb, queryProjects, queryProjectById } from '../desktop/db.js';
import type { ProjectRow } from '../desktop/types.js';

export interface GetProjectsResult {
  projects: Array<Omit<ProjectRow, never>>;
}

export function getProjects(): GetProjectsResult {
  const db = openDesktopDb();
  try {
    return { projects: queryProjects(db) };
  } finally {
    db.close();
  }
}

export function getProject(projectId: string): ProjectRow {
  const db = openDesktopDb();
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

export function registerDesktopGetProjectsTool(server: McpServer): void {
  server.tool('list_projects', 'List all projects registered in Specrails Desktop', {}, () => {
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
