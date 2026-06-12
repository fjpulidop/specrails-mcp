import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  openDesktopDb,
  openProjectDb,
  queryProjects,
  queryProjectById,
  queryAnalytics,
  queryCostTimeline,
} from '../desktop/db.js';

export type AnalyticsPeriod = '7d' | '30d' | 'all';

export interface GetAnalyticsParams {
  projectId?: string;
  period?: AnalyticsPeriod;
}

export interface ProjectAnalyticsResult {
  projectId: string;
  projectName: string;
  period: AnalyticsPeriod;
  kpi: {
    totalJobs: number;
    totalCostUsd: number;
    successRate: number;
    avgDurationMs: number;
    tokensIn: number;
    tokensOut: number;
    tokensCacheRead: number;
  };
  costTimeline: Array<{ date: string; costUsd: number; jobCount: number }>;
}

export interface DesktopAnalyticsResult {
  period: AnalyticsPeriod;
  desktop: {
    totalJobs: number;
    totalCostUsd: number;
    successRate: number;
    projectsActive: number;
  };
  byProject: Array<{
    projectId: string;
    projectName: string;
    totalJobs: number;
    totalCostUsd: number;
    successRate: number;
    avgDurationMs: number;
  }>;
}

export function getAnalytics(
  params: GetAnalyticsParams,
): ProjectAnalyticsResult | DesktopAnalyticsResult {
  const period: AnalyticsPeriod = params.period ?? '30d';
  const fromDate = periodToDate(period);

  if (params.projectId) {
    return getProjectAnalytics(params.projectId, period, fromDate);
  }
  return getDesktopWideAnalytics(period, fromDate);
}

function getProjectAnalytics(
  projectId: string,
  period: AnalyticsPeriod,
  fromDate: string | null,
): ProjectAnalyticsResult {
  const desktopDb = openDesktopDb();
  try {
    const project = queryProjectById(desktopDb, projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const projectDb = openProjectDb(project.slug);
    try {
      const kpi = queryAnalytics(projectDb, fromDate ?? undefined);
      const timeline = queryCostTimeline(
        projectDb,
        fromDate ?? undefined,
        period === '7d' ? 7 : 30,
      );

      return {
        projectId: project.id,
        projectName: project.name,
        period,
        kpi: {
          totalJobs: kpi.total_jobs,
          totalCostUsd: kpi.total_cost_usd,
          successRate: kpi.success_rate,
          avgDurationMs: kpi.avg_duration_ms,
          tokensIn: kpi.tokens_in,
          tokensOut: kpi.tokens_out,
          tokensCacheRead: kpi.tokens_cache_read,
        },
        costTimeline: timeline.map((t) => ({
          date: t.date,
          costUsd: t.cost_usd,
          jobCount: t.job_count,
        })),
      };
    } finally {
      projectDb.close();
    }
  } finally {
    desktopDb.close();
  }
}

function getDesktopWideAnalytics(
  period: AnalyticsPeriod,
  fromDate: string | null,
): DesktopAnalyticsResult {
  const desktopDb = openDesktopDb();
  try {
    const projects = queryProjects(desktopDb);

    let totalCostAcrossProjects = 0;
    let totalJobsAcrossProjects = 0;
    let successJobsAcrossProjects = 0;
    const byProject: DesktopAnalyticsResult['byProject'] = [];

    for (const project of projects) {
      try {
        const projectDb = openProjectDb(project.slug);
        try {
          const kpi = queryAnalytics(projectDb, fromDate ?? undefined);
          if (kpi.total_jobs > 0) {
            totalCostAcrossProjects += kpi.total_cost_usd;
            totalJobsAcrossProjects += kpi.total_jobs;
            successJobsAcrossProjects += Math.round(kpi.total_jobs * kpi.success_rate);
            byProject.push({
              projectId: project.id,
              projectName: project.name,
              totalJobs: kpi.total_jobs,
              totalCostUsd: kpi.total_cost_usd,
              successRate: kpi.success_rate,
              avgDurationMs: kpi.avg_duration_ms,
            });
          }
        } finally {
          projectDb.close();
        }
      } catch {
        // Project DB not yet initialized — skip
      }
    }

    return {
      period,
      desktop: {
        totalJobs: totalJobsAcrossProjects,
        totalCostUsd: totalCostAcrossProjects,
        successRate:
          totalJobsAcrossProjects > 0 ? successJobsAcrossProjects / totalJobsAcrossProjects : 0,
        projectsActive: byProject.length,
      },
      byProject,
    };
  } finally {
    desktopDb.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodToDate(period: AnalyticsPeriod): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerDesktopGetAnalyticsTool(server: McpServer): void {
  server.tool(
    'get_analytics',
    'Get analytics data — cost, job counts, success rates. Optionally scoped to a single project',
    {
      projectId: z
        .string()
        .optional()
        .describe('Project ID to scope analytics. Omit for aggregation across all projects'),
      period: z
        .enum(['7d', '30d', 'all'])
        .optional()
        .default('30d')
        .describe('Time period: 7d, 30d, or all (default: 30d)'),
    },
    ({ projectId, period }) => {
      const params: GetAnalyticsParams = { period };
      if (projectId !== undefined) params.projectId = projectId;
      const result = getAnalytics(params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
