import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { openHubDb, queryProjectById, getHubApiBase } from '../hub/db.js';

export interface EnqueueJobParams {
  projectId: string;
  command: string;
  model?: string;
}

export interface EnqueueJobResult {
  success: boolean;
  jobId: string | null;
  message: string;
  projectId: string;
  projectName: string;
  command: string;
}

export async function enqueueJob(params: EnqueueJobParams): Promise<EnqueueJobResult> {
  const hubDb = openHubDb();
  let projectName = '';
  try {
    const project = queryProjectById(hubDb, params.projectId);
    if (!project) {
      throw new Error(`Project not found: ${params.projectId}`);
    }
    projectName = project.name;
  } finally {
    hubDb.close();
  }

  const apiBase = getHubApiBase();
  const url = `${apiBase}/api/projects/${params.projectId}/queue`;

  const body: Record<string, unknown> = { command: params.command };
  if (params.model) body['model'] = params.model;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: string };
      errorMsg = errorBody.error ?? errorMsg;
    } catch {
      // ignore parse error
    }
    throw new Error(`Failed to enqueue job: ${errorMsg}`);
  }

  const result = (await response.json()) as { id?: string; jobId?: string };
  const jobId = result.id ?? result.jobId ?? null;

  return {
    success: true,
    jobId,
    message: `Job enqueued successfully in project "${projectName}"`,
    projectId: params.projectId,
    projectName,
    command: params.command,
  };
}

export function registerHubEnqueueJobTool(server: McpServer): void {
  server.tool(
    'enqueue_job',
    'Enqueue a new AI job in a specrails project. The hub server must be running. Commands follow specrails-core conventions (e.g. "implement", "health-check", "product-backlog")',
    {
      projectId: z.string().describe('Project ID to run the job in'),
      command: z
        .string()
        .min(1)
        .describe('Command to run (e.g. "implement", "health-check", "product-backlog #42")'),
      model: z.string().optional().describe('Override the AI model (e.g. "claude-opus-4-6")'),
    },
    async ({ projectId, command, model }) => {
      const params: EnqueueJobParams = { projectId, command };
      if (model !== undefined) params.model = model;
      const result = await enqueueJob(params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
