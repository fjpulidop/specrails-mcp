import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { openHubDb, openProjectDb, queryProjectById, queryJobs, queryJobById } from '../hub/db.js';
import type { JobRow, JobDetailRow } from '../hub/types.js';

export interface GetJobsParams {
  projectId: string;
  limit?: number;
  offset?: number;
  status?: string;
}

export interface GetJobsResult {
  projectId: string;
  projectName: string;
  jobs: JobRow[];
  total: number;
  limit: number;
  offset: number;
}

export function getJobs(params: GetJobsParams): GetJobsResult {
  const hubDb = openHubDb();
  try {
    const project = queryProjectById(hubDb, params.projectId);
    if (!project) {
      throw new Error(`Project not found: ${params.projectId}`);
    }

    const projectDb = openProjectDb(project.slug);
    try {
      const limit = Math.min(params.limit ?? 20, 100);
      const offset = params.offset ?? 0;
      const listOpts: Parameters<typeof queryJobs>[1] = { limit, offset };
      if (params.status) listOpts.status = params.status;
      const { jobs, total } = queryJobs(projectDb, listOpts);

      return {
        projectId: project.id,
        projectName: project.name,
        jobs,
        total,
        limit,
        offset,
      };
    } finally {
      projectDb.close();
    }
  } finally {
    hubDb.close();
  }
}

export interface GetJobDetailParams {
  projectId: string;
  jobId: string;
}

export interface GetJobDetailResult {
  projectId: string;
  projectName: string;
  job: JobDetailRow;
}

export function getJobDetail(params: GetJobDetailParams): GetJobDetailResult {
  const hubDb = openHubDb();
  try {
    const project = queryProjectById(hubDb, params.projectId);
    if (!project) {
      throw new Error(`Project not found: ${params.projectId}`);
    }

    const projectDb = openProjectDb(project.slug);
    try {
      const job = queryJobById(projectDb, params.jobId);
      if (!job) {
        throw new Error(`Job not found: ${params.jobId} in project ${project.name}`);
      }

      return {
        projectId: project.id,
        projectName: project.name,
        job,
      };
    } finally {
      projectDb.close();
    }
  } finally {
    hubDb.close();
  }
}

export function registerHubGetJobsTool(server: McpServer): void {
  server.tool(
    'get_jobs',
    'Get jobs for a specific project with optional status filtering and pagination',
    {
      projectId: z.string().describe('Project ID from list_projects'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Max jobs to return (default 20)'),
      offset: z.number().int().min(0).optional().default(0).describe('Pagination offset'),
      status: z
        .enum(['running', 'success', 'failed', 'cancelled'])
        .optional()
        .describe('Filter by job status'),
    },
    ({ projectId, limit, offset, status }) => {
      const params: GetJobsParams = { projectId, limit, offset };
      if (status !== undefined) params.status = status;
      const result = getJobs(params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_job_detail',
    'Get detailed information about a specific job including its event log and phase transitions',
    {
      projectId: z.string().describe('Project ID from list_projects'),
      jobId: z.string().describe('Job ID from get_jobs'),
    },
    ({ projectId, jobId }) => {
      const result = getJobDetail({ projectId, jobId });
      const truncated = {
        ...result,
        job: {
          ...result.job,
          events: result.job.events.slice(-200),
          _eventsTruncated:
            result.job.events.length > 200
              ? `Showing last 200 of ${result.job.events.length} events`
              : undefined,
        },
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(truncated, null, 2) }],
      };
    },
  );
}
