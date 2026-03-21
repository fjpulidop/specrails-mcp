import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseType } from '../../src/hub/types.js';

// ─── DB factory helpers ───────────────────────────────────────────────────────

function makeFreshHubDb(): DatabaseType {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE, db_path TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'claude',
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.prepare(
    `
    INSERT INTO projects (id, slug, name, path, db_path, provider) VALUES
    ('proj-1', 'my-project', 'My Project', '/home/user/my-project', '/my-project/db', 'claude'),
    ('proj-2', 'other-proj', 'Other Project', '/home/user/other', '/other/db', 'codex')
  `,
  ).run();
  return db;
}

function makeFreshProjectDb(): DatabaseType {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY, command TEXT NOT NULL, started_at TEXT NOT NULL,
      finished_at TEXT, status TEXT NOT NULL DEFAULT 'running',
      exit_code INTEGER, tokens_in INTEGER, tokens_out INTEGER,
      tokens_cache_read INTEGER, tokens_cache_create INTEGER,
      total_cost_usd REAL, num_turns INTEGER, model TEXT,
      duration_ms INTEGER, duration_api_ms INTEGER, session_id TEXT
    );
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
      seq INTEGER NOT NULL, event_type TEXT NOT NULL, source TEXT,
      payload TEXT NOT NULL, timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE job_phases (
      job_id TEXT NOT NULL, phase TEXT NOT NULL, state TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (job_id, phase)
    );
  `);
  db.prepare(
    `
    INSERT INTO jobs (id, command, started_at, status, total_cost_usd, duration_ms, model) VALUES
    ('job-a', 'implement', '2024-06-01T10:00:00', 'success', 0.15, 45000, 'claude-sonnet-4-5'),
    ('job-b', 'health-check', '2024-06-02T10:00:00', 'failed', 0.02, 8000, 'claude-sonnet-4-5')
  `,
  ).run();
  return db;
}

// ─── Mock the db module — fresh DB per call ───────────────────────────────────

import type * as HubDb from '../../src/hub/db.js';

vi.mock('../../src/hub/db.js', async () => {
  const actual = await vi.importActual<typeof HubDb>('../../src/hub/db.js');
  return {
    ...actual,
    openHubDb: () => makeFreshHubDb(),
    openProjectDb: (_slug: string) => makeFreshProjectDb(),
    getHubApiBase: () => 'http://localhost:4200',
  };
});

import { getProjects, getProject, registerHubGetProjectsTool } from '../../src/tools/hub-get-projects.js';
import { getJobs, getJobDetail, registerHubGetJobsTool } from '../../src/tools/hub-get-jobs.js';
import { getAnalytics, registerHubGetAnalyticsTool } from '../../src/tools/hub-get-analytics.js';

// ─── getProjects ──────────────────────────────────────────────────────────────

describe('getProjects', () => {
  it('returns all projects', () => {
    const result = getProjects();
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0]?.slug).toBe('my-project');
    expect(result.projects[1]?.slug).toBe('other-proj');
  });

  it('includes provider field', () => {
    const result = getProjects();
    expect(result.projects[0]?.provider).toBe('claude');
    expect(result.projects[1]?.provider).toBe('codex');
  });
});

// ─── getJobs ─────────────────────────────────────────────────────────────────

describe('getJobs', () => {
  it('returns jobs for a project', () => {
    const result = getJobs({ projectId: 'proj-1' });
    expect(result.projectId).toBe('proj-1');
    expect(result.projectName).toBe('My Project');
    expect(result.jobs).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('throws for unknown project', () => {
    expect(() => getJobs({ projectId: 'nope' })).toThrow('Project not found');
  });

  it('respects limit', () => {
    const result = getJobs({ projectId: 'proj-1', limit: 1 });
    expect(result.jobs).toHaveLength(1);
    expect(result.total).toBe(2);
  });

  it('filters by status', () => {
    const result = getJobs({ projectId: 'proj-1', status: 'success' });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.status).toBe('success');
  });
});

// ─── getJobDetail ─────────────────────────────────────────────────────────────

describe('getJobDetail', () => {
  it('returns job detail', () => {
    const result = getJobDetail({ projectId: 'proj-1', jobId: 'job-a' });
    expect(result.projectId).toBe('proj-1');
    expect(result.job.id).toBe('job-a');
    expect(result.job.command).toBe('implement');
    expect(result.job.events).toBeDefined();
    expect(result.job.phases).toBeDefined();
  });

  it('throws for unknown project', () => {
    expect(() => getJobDetail({ projectId: 'unknown', jobId: 'job-a' })).toThrow(
      'Project not found',
    );
  });

  it('throws for unknown job', () => {
    expect(() => getJobDetail({ projectId: 'proj-1', jobId: 'does-not-exist' })).toThrow(
      'Job not found',
    );
  });
});

// ─── getAnalytics ─────────────────────────────────────────────────────────────

describe('getAnalytics — hub-wide', () => {
  it('returns hub analytics with byProject breakdown', () => {
    const result = getAnalytics({ period: '30d' });
    expect('hub' in result).toBe(true);
    if ('hub' in result) {
      expect(result.hub.totalJobs).toBeGreaterThanOrEqual(0);
      expect(result.byProject).toBeDefined();
    }
  });
});

describe('getAnalytics — per project', () => {
  it('returns project analytics with kpi and timeline', () => {
    const result = getAnalytics({ projectId: 'proj-1', period: '30d' });
    expect('kpi' in result).toBe(true);
    if ('kpi' in result) {
      expect(result.kpi.totalJobs).toBeGreaterThanOrEqual(0);
      expect(result.costTimeline).toBeDefined();
    }
  });

  it('throws for unknown project', () => {
    expect(() => getAnalytics({ projectId: 'unknown' })).toThrow('Project not found');
  });

  it('returns project analytics for all-time period', () => {
    const result = getAnalytics({ projectId: 'proj-1', period: 'all' });
    expect('kpi' in result).toBe(true);
    if ('kpi' in result) {
      // all period: includes old 2024 jobs
      expect(result.kpi.totalJobs).toBe(2);
      expect(result.period).toBe('all');
    }
  });

  it('returns project analytics for 7d period', () => {
    const result = getAnalytics({ projectId: 'proj-1', period: '7d' });
    expect('kpi' in result).toBe(true);
  });
});

describe('getAnalytics — hub-wide with jobs (all period)', () => {
  it('includes byProject entries when period=all covers old jobs', () => {
    const result = getAnalytics({ period: 'all' });
    expect('hub' in result).toBe(true);
    if ('hub' in result) {
      // The mock creates a fresh project db per project call (2 projects × 2 jobs = 4 total)
      expect(result.hub.totalJobs).toBeGreaterThan(0);
      expect(result.hub.totalCostUsd).toBeGreaterThan(0);
      // successRate branch: hubTotalJobs > 0, so rate is computed (not zero-division path)
      expect(result.hub.successRate).toBeGreaterThanOrEqual(0);
      expect(result.byProject.length).toBeGreaterThan(0);
    }
  });
});

// ─── getProject ───────────────────────────────────────────────────────────────

describe('getProject', () => {
  it('returns a single project by ID', () => {
    const result = getProject('proj-1');
    expect(result.id).toBe('proj-1');
    expect(result.name).toBe('My Project');
    expect(result.slug).toBe('my-project');
  });

  it('throws for unknown project ID', () => {
    expect(() => getProject('does-not-exist')).toThrow('Project not found');
  });
});

// ─── registerHubGetProjectsTool ───────────────────────────────────────────────

describe('registerHubGetProjectsTool', () => {
  it('registers list_projects and get_project tools', () => {
    const server = { tool: vi.fn() };
    registerHubGetProjectsTool(server as never);
    expect(server.tool).toHaveBeenCalledTimes(2);
    expect(server.tool.mock.calls[0]?.[0]).toBe('list_projects');
    expect(server.tool.mock.calls[1]?.[0]).toBe('get_project');
  });

  it('list_projects handler returns all projects as JSON', () => {
    const server = { tool: vi.fn() };
    registerHubGetProjectsTool(server as never);

    // list_projects: server.tool(name, description, schema, handler) → handler at index 3
    const handler = server.tool.mock.calls[0]?.[3] as () => {
      content: Array<{ type: string; text: string }>;
    };
    const result = handler();
    const data = JSON.parse(result.content[0]?.text ?? '{}') as { projects: unknown[] };
    expect(data.projects).toHaveLength(2);
  });

  it('get_project handler returns project details as JSON', () => {
    const server = { tool: vi.fn() };
    registerHubGetProjectsTool(server as never);

    const handler = server.tool.mock.calls[1]?.[3] as (p: { projectId: string }) => {
      content: Array<{ type: string; text: string }>;
    };
    const result = handler({ projectId: 'proj-1' });
    const data = JSON.parse(result.content[0]?.text ?? '{}') as { id: string };
    expect(data.id).toBe('proj-1');
  });
});

// ─── registerHubGetJobsTool ───────────────────────────────────────────────────

describe('registerHubGetJobsTool', () => {
  it('registers get_jobs and get_job_detail tools', () => {
    const server = { tool: vi.fn() };
    registerHubGetJobsTool(server as never);
    expect(server.tool).toHaveBeenCalledTimes(2);
    expect(server.tool.mock.calls[0]?.[0]).toBe('get_jobs');
    expect(server.tool.mock.calls[1]?.[0]).toBe('get_job_detail');
  });

  it('get_jobs handler returns jobs list as JSON', () => {
    const server = { tool: vi.fn() };
    registerHubGetJobsTool(server as never);

    const handler = server.tool.mock.calls[0]?.[3] as (p: {
      projectId: string;
      limit: number;
      offset: number;
      status?: 'running' | 'success' | 'failed' | 'cancelled';
    }) => { content: Array<{ type: string; text: string }> };

    const result = handler({ projectId: 'proj-1', limit: 20, offset: 0 });
    const data = JSON.parse(result.content[0]?.text ?? '{}') as {
      jobs: unknown[];
      total: number;
    };
    expect(data.jobs).toHaveLength(2);
    expect(data.total).toBe(2);
  });

  it('get_jobs handler passes status filter', () => {
    const server = { tool: vi.fn() };
    registerHubGetJobsTool(server as never);

    const handler = server.tool.mock.calls[0]?.[3] as (p: {
      projectId: string;
      limit: number;
      offset: number;
      status?: 'running' | 'success' | 'failed' | 'cancelled';
    }) => { content: Array<{ type: string; text: string }> };

    const result = handler({ projectId: 'proj-1', limit: 20, offset: 0, status: 'success' });
    const data = JSON.parse(result.content[0]?.text ?? '{}') as { jobs: unknown[] };
    expect(data.jobs).toHaveLength(1);
  });

  it('get_job_detail handler returns job detail with truncated events', () => {
    const server = { tool: vi.fn() };
    registerHubGetJobsTool(server as never);

    const handler = server.tool.mock.calls[1]?.[3] as (p: {
      projectId: string;
      jobId: string;
    }) => { content: Array<{ type: string; text: string }> };

    const result = handler({ projectId: 'proj-1', jobId: 'job-a' });
    const data = JSON.parse(result.content[0]?.text ?? '{}') as {
      job: { id: string; events: unknown[] };
    };
    expect(data.job.id).toBe('job-a');
    expect(Array.isArray(data.job.events)).toBe(true);
  });
});

// ─── registerHubGetAnalyticsTool ──────────────────────────────────────────────

describe('registerHubGetAnalyticsTool', () => {
  it('registers get_analytics tool', () => {
    const server = { tool: vi.fn() };
    registerHubGetAnalyticsTool(server as never);
    expect(server.tool).toHaveBeenCalledOnce();
    expect(server.tool.mock.calls[0]?.[0]).toBe('get_analytics');
  });

  it('handler returns hub-wide analytics as JSON', () => {
    const server = { tool: vi.fn() };
    registerHubGetAnalyticsTool(server as never);

    const handler = server.tool.mock.calls[0]?.[3] as (p: {
      period: '7d' | '30d' | 'all';
      projectId?: string;
    }) => { content: Array<{ type: string; text: string }> };

    const result = handler({ period: '30d' });
    const data = JSON.parse(result.content[0]?.text ?? '{}') as { hub: unknown };
    expect(data.hub).toBeDefined();
  });

  it('handler returns project analytics when projectId provided', () => {
    const server = { tool: vi.fn() };
    registerHubGetAnalyticsTool(server as never);

    const handler = server.tool.mock.calls[0]?.[3] as (p: {
      period: '7d' | '30d' | 'all';
      projectId?: string;
    }) => { content: Array<{ type: string; text: string }> };

    const result = handler({ period: 'all', projectId: 'proj-1' });
    const data = JSON.parse(result.content[0]?.text ?? '{}') as { kpi: unknown };
    expect(data.kpi).toBeDefined();
  });
});
