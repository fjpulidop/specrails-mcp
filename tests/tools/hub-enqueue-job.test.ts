import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock hub/db.js ───────────────────────────────────────────────────────────

const { mockOpenHubDb, mockQueryProjectById, mockGetHubApiBase } = vi.hoisted(() => ({
  mockOpenHubDb: vi.fn(),
  mockQueryProjectById: vi.fn(),
  mockGetHubApiBase: vi.fn(),
}));

vi.mock('../../src/hub/db.js', () => ({
  openHubDb: mockOpenHubDb,
  queryProjectById: mockQueryProjectById,
  getHubApiBase: mockGetHubApiBase,
}));

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { enqueueJob, registerHubEnqueueJobTool } from '../../src/tools/hub-enqueue-job.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockDb = { close: vi.fn() };

const mockProject = {
  id: 'proj-1',
  slug: 'my-project',
  name: 'My Project',
  path: '/home/user/my-project',
  provider: 'claude' as const,
  added_at: '2024-01-01',
  last_seen_at: '2024-01-02',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockOpenHubDb.mockReturnValue(mockDb);
  mockQueryProjectById.mockReturnValue(mockProject);
  mockGetHubApiBase.mockReturnValue('http://localhost:4200');

  globalThis.fetch = mockFetch as typeof fetch;
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'job-xyz-123' }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── enqueueJob tests ─────────────────────────────────────────────────────────

describe('enqueueJob', () => {
  it('enqueues a job and returns success result', async () => {
    const result = await enqueueJob({ projectId: 'proj-1', command: 'implement' });
    expect(result.success).toBe(true);
    expect(result.jobId).toBe('job-xyz-123');
    expect(result.projectName).toBe('My Project');
    expect(result.command).toBe('implement');
    expect(result.message).toContain('My Project');
  });

  it('includes model in request body when provided', async () => {
    await enqueueJob({ projectId: 'proj-1', command: 'implement', model: 'claude-opus-4-6' });

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse((fetchCall?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body['model']).toBe('claude-opus-4-6');
  });

  it('does not include model when not provided', async () => {
    await enqueueJob({ projectId: 'proj-1', command: 'health-check' });

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse((fetchCall?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body['model']).toBeUndefined();
  });

  it('throws when project is not found', async () => {
    mockQueryProjectById.mockReturnValue(null);
    await expect(enqueueJob({ projectId: 'unknown', command: 'implement' })).rejects.toThrow(
      'Project not found',
    );
  });

  it('throws when server returns non-ok response with error body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Invalid command format' }),
    } as Response);

    await expect(enqueueJob({ projectId: 'proj-1', command: 'bad command!' })).rejects.toThrow(
      'Invalid command format',
    );
  });

  it('throws with HTTP status when error body has no error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal error' }),
    } as Response);

    await expect(enqueueJob({ projectId: 'proj-1', command: 'implement' })).rejects.toThrow(
      'HTTP 500',
    );
  });

  it('throws when error response body is not valid JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('invalid json');
      },
    } as unknown as Response);

    await expect(enqueueJob({ projectId: 'proj-1', command: 'implement' })).rejects.toThrow(
      'HTTP 503',
    );
  });

  it('uses jobId from result.jobId when result.id is absent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: 'alt-job-id' }),
    } as Response);

    const result = await enqueueJob({ projectId: 'proj-1', command: 'implement' });
    expect(result.jobId).toBe('alt-job-id');
  });

  it('returns null jobId when neither id nor jobId present in response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await enqueueJob({ projectId: 'proj-1', command: 'implement' });
    expect(result.jobId).toBeNull();
  });

  it('constructs correct API URL', async () => {
    await enqueueJob({ projectId: 'proj-1', command: 'implement' });

    const fetchUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(fetchUrl).toBe('http://localhost:4200/api/projects/proj-1/queue');
  });
});

// ─── registerHubEnqueueJobTool tests ─────────────────────────────────────────

describe('registerHubEnqueueJobTool', () => {
  it('registers enqueue_job tool', () => {
    const server = { tool: vi.fn() };
    registerHubEnqueueJobTool(server as never);
    expect(server.tool).toHaveBeenCalledOnce();
    expect(server.tool.mock.calls[0]?.[0]).toBe('enqueue_job');
  });

  it('handler enqueues job and returns JSON content', async () => {
    const server = { tool: vi.fn() };
    registerHubEnqueueJobTool(server as never);

    const handler = server.tool.mock.calls[0]?.[3] as (params: {
      projectId: string;
      command: string;
      model?: string;
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    const result = await handler({ projectId: 'proj-1', command: 'implement' });
    const data = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;

    expect(data['success']).toBe(true);
    expect(data['command']).toBe('implement');
  });

  it('handler passes model when provided', async () => {
    const server = { tool: vi.fn() };
    registerHubEnqueueJobTool(server as never);

    const handler = server.tool.mock.calls[0]?.[3] as (params: {
      projectId: string;
      command: string;
      model?: string;
    }) => Promise<{ content: Array<{ type: string; text: string }> }>;

    await handler({ projectId: 'proj-1', command: 'implement', model: 'claude-opus-4-6' });

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse((fetchCall?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body['model']).toBe('claude-opus-4-6');
  });
});
