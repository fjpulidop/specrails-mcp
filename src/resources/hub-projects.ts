import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  openHubDb,
  openProjectDb,
  queryProjects,
  queryProjectById,
  queryAnalytics,
} from '../hub/db.js';

// ─── Resource: list all projects ──────────────────────────────────────────────

function listProjectsResource(): string {
  const db = openHubDb();
  try {
    const projects = queryProjects(db);

    if (projects.length === 0) {
      return 'No projects registered in specrails-hub.\n\nAdd a project with: specrails-hub add <path>';
    }

    const lines: string[] = ['# specrails-hub Projects\n'];

    for (const p of projects) {
      lines.push(`## ${p.name}`);
      lines.push(`- **ID**: ${p.id}`);
      lines.push(`- **Slug**: ${p.slug}`);
      lines.push(`- **Path**: ${p.path}`);
      lines.push(`- **Provider**: ${p.provider}`);
      lines.push(`- **Added**: ${p.added_at}`);
      lines.push(`- **Last seen**: ${p.last_seen_at}`);
      lines.push('');
    }

    return lines.join('\n');
  } finally {
    db.close();
  }
}

// ─── Resource: single project detail ─────────────────────────────────────────

function getProjectResource(projectId: string): string {
  const hubDb = openHubDb();
  try {
    const project = queryProjectById(hubDb, projectId);

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const lines: string[] = [`# Project: ${project.name}\n`];
    lines.push(`- **ID**: ${project.id}`);
    lines.push(`- **Slug**: ${project.slug}`);
    lines.push(`- **Path**: ${project.path}`);
    lines.push(`- **Provider**: ${project.provider}`);
    lines.push(`- **Added**: ${project.added_at}`);
    lines.push(`- **Last seen**: ${project.last_seen_at}`);
    lines.push('');

    try {
      const projectDb = openProjectDb(project.slug);
      try {
        const kpi = queryAnalytics(projectDb);
        lines.push('## Quick Stats (all time)\n');
        lines.push(`- **Total jobs**: ${kpi.total_jobs}`);
        lines.push(`- **Total cost**: $${kpi.total_cost_usd.toFixed(4)}`);
        lines.push(`- **Success rate**: ${(kpi.success_rate * 100).toFixed(1)}%`);
        if (kpi.avg_duration_ms > 0) {
          lines.push(`- **Avg duration**: ${Math.round(kpi.avg_duration_ms / 1000)}s`);
        }
      } finally {
        projectDb.close();
      }
    } catch {
      lines.push('*Project database not yet available (no jobs run yet)*');
    }

    return lines.join('\n');
  } finally {
    hubDb.close();
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerHubProjectsResources(server: McpServer): void {
  server.resource(
    'hub-projects',
    'specrails://hub/projects',
    { description: 'All projects registered in specrails-hub' },
    (_uri) => ({
      contents: [
        {
          uri: 'specrails://hub/projects',
          text: listProjectsResource(),
          mimeType: 'text/markdown',
        },
      ],
    }),
  );

  server.resource(
    'hub-project',
    new ResourceTemplate('specrails://hub/projects/{projectId}', { list: undefined }),
    { description: 'Details and quick stats for a specific project' },
    (_uri, variables) => {
      const raw = variables['projectId'];
      const projectId = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
      return {
        contents: [
          {
            uri: `specrails://hub/projects/${projectId}`,
            text: getProjectResource(projectId),
            mimeType: 'text/markdown',
          },
        ],
      };
    },
  );
}
