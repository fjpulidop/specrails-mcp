import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  openDesktopDb,
  openProjectDb,
  queryProjects,
  queryProjectById,
  queryAnalytics,
  queryCostTimeline,
} from '../desktop/db.js';

type Period = '7d' | '30d' | 'all';

// ─── Resource: app-wide analytics ────────────────────────────────────────────

function desktopAnalyticsResource(period: Period = '30d'): string {
  const desktopDb = openDesktopDb();
  try {
    const projects = queryProjects(desktopDb);

    if (projects.length === 0) {
      return 'No projects registered. Add projects to Specrails Desktop to see analytics.';
    }

    const fromDate = periodToDate(period);
    const periodLabel =
      period === '7d' ? 'Last 7 days' : period === '30d' ? 'Last 30 days' : 'All time';

    const lines: string[] = [`# Specrails Desktop Analytics — ${periodLabel}\n`];

    let totalCostAcrossProjects = 0;
    let totalJobsAcrossProjects = 0;
    let successJobsAcrossProjects = 0;

    const projectStats: Array<{
      name: string;
      kpi: ReturnType<typeof queryAnalytics>;
    }> = [];

    for (const project of projects) {
      try {
        const projectDb = openProjectDb(project.slug);
        try {
          const kpi = queryAnalytics(projectDb, fromDate ?? undefined);
          totalCostAcrossProjects += kpi.total_cost_usd;
          totalJobsAcrossProjects += kpi.total_jobs;
          successJobsAcrossProjects += Math.round(kpi.total_jobs * kpi.success_rate);
          projectStats.push({ name: project.name, kpi });
        } finally {
          projectDb.close();
        }
      } catch {
        // Project DB not yet initialized — skip
      }
    }

    const successRateAcrossProjects =
      totalJobsAcrossProjects > 0 ? (successJobsAcrossProjects / totalJobsAcrossProjects) * 100 : 0;

    lines.push('## Summary\n');
    lines.push(`- **Total cost**: $${totalCostAcrossProjects.toFixed(4)}`);
    lines.push(`- **Total jobs**: ${totalJobsAcrossProjects}`);
    lines.push(`- **Success rate**: ${successRateAcrossProjects.toFixed(1)}%`);
    lines.push(`- **Projects active**: ${projectStats.filter((p) => p.kpi.total_jobs > 0).length}`);
    lines.push('');

    if (projectStats.some((p) => p.kpi.total_jobs > 0)) {
      lines.push('## By Project\n');
      lines.push('| Project | Jobs | Cost | Success Rate | Avg Duration |');
      lines.push('|---------|------|------|--------------|--------------|');

      for (const { name, kpi } of projectStats) {
        if (kpi.total_jobs === 0) continue;
        const cost = `$${kpi.total_cost_usd.toFixed(4)}`;
        const sr = `${(kpi.success_rate * 100).toFixed(1)}%`;
        const dur = kpi.avg_duration_ms > 0 ? `${Math.round(kpi.avg_duration_ms / 1000)}s` : 'n/a';
        lines.push(`| ${name} | ${kpi.total_jobs} | ${cost} | ${sr} | ${dur} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } finally {
    desktopDb.close();
  }
}

// ─── Resource: single project analytics ──────────────────────────────────────

function projectAnalyticsResource(projectId: string, period: Period = '30d'): string {
  const desktopDb = openDesktopDb();
  try {
    const project = queryProjectById(desktopDb, projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const fromDate = periodToDate(period);
    const periodLabel =
      period === '7d' ? 'Last 7 days' : period === '30d' ? 'Last 30 days' : 'All time';

    const projectDb = openProjectDb(project.slug);
    try {
      const kpi = queryAnalytics(projectDb, fromDate ?? undefined);
      const timeline = queryCostTimeline(
        projectDb,
        fromDate ?? undefined,
        period === '7d' ? 7 : 30,
      );

      const lines: string[] = [`# Analytics — ${project.name} (${periodLabel})\n`];

      lines.push('## KPIs\n');
      lines.push(`- **Total jobs**: ${kpi.total_jobs}`);
      lines.push(`- **Total cost**: $${kpi.total_cost_usd.toFixed(6)}`);
      lines.push(`- **Success rate**: ${(kpi.success_rate * 100).toFixed(1)}%`);
      if (kpi.avg_duration_ms > 0)
        lines.push(`- **Avg duration**: ${Math.round(kpi.avg_duration_ms / 1000)}s`);
      lines.push('');

      if (kpi.tokens_in > 0) {
        lines.push('## Token Usage\n');
        lines.push(`- **Tokens in**: ${kpi.tokens_in.toLocaleString()}`);
        lines.push(`- **Tokens out**: ${kpi.tokens_out.toLocaleString()}`);
        if (kpi.tokens_cache_read > 0)
          lines.push(`- **Cache read**: ${kpi.tokens_cache_read.toLocaleString()}`);
        lines.push('');
      }

      if (timeline.length > 0) {
        lines.push('## Daily Cost Timeline\n');
        lines.push('| Date | Cost | Jobs |');
        lines.push('|------|------|------|');
        for (const day of timeline) {
          lines.push(`| ${day.date} | $${day.cost_usd.toFixed(4)} | ${day.job_count} |`);
        }
        lines.push('');
      }

      return lines.join('\n');
    } finally {
      projectDb.close();
    }
  } finally {
    desktopDb.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodToDate(period: Period): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerDesktopAnalyticsResources(server: McpServer): void {
  server.resource(
    'desktop-analytics',
    'specrails://desktop/analytics',
    { description: 'Aggregated analytics across all projects (last 30 days)' },
    (_uri) => ({
      contents: [
        {
          uri: 'specrails://desktop/analytics',
          text: desktopAnalyticsResource('30d'),
          mimeType: 'text/markdown',
        },
      ],
    }),
  );

  server.resource(
    'desktop-project-analytics',
    new ResourceTemplate('specrails://desktop/projects/{projectId}/analytics', { list: undefined }),
    { description: 'Analytics for a specific project (last 30 days)' },
    (_uri, variables) => {
      const raw = variables['projectId'];
      const projectId = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
      return {
        contents: [
          {
            uri: `specrails://desktop/projects/${projectId}/analytics`,
            text: projectAnalyticsResource(projectId, '30d'),
            mimeType: 'text/markdown',
          },
        ],
      };
    },
  );
}
