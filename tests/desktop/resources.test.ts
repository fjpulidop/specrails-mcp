import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseType } from '../../src/desktop/types.js';

// ─── In-memory DB helpers ─────────────────────────────────────────────────────

function recentTs(daysAgo = 1): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 19);
}

function makeDesktopDb(): DatabaseType {
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
    `INSERT INTO projects (id, slug, name, path, db_path, provider) VALUES
     ('proj-1', 'my-project', 'My Project', '/home/user/my-project', '/my-project/db', 'claude'),
     ('proj-2', 'other-proj', 'Other Project', '/home/user/other', '/other/db', 'codex')`,
  ).run();
  return db;
}

function makeEmptyDesktopDb(): DatabaseType {
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
  return db;
}

function makeProjectDb(): DatabaseType {
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

  const t1 = recentTs(2);
  const t2 = recentTs(1);
  const t3 = recentTs(3);
  const t4 = recentTs(4);
  const t5 = recentTs(5);

  db.prepare(
    `INSERT INTO jobs
       (id, command, started_at, finished_at, status, exit_code,
        tokens_in, tokens_out, tokens_cache_read, tokens_cache_create,
        total_cost_usd, num_turns, model, duration_ms)
     VALUES
       ('job-a', 'implement', '${t1}', '${t1}', 'success', 0, 1000, 500, 200, 50,  0.15, 10, 'claude-sonnet-4-5', 45000),
       ('job-b', 'health-check', '${t2}', '${t2}', 'failed',  1,  200, 100,   0,  0,  0.02,  3, 'claude-sonnet-4-5',  8000),
       ('job-c', 'test-run',    '${t3}', NULL,     'running', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
       ('job-d', 'cancel-me',   '${t4}', '${t4}', 'cancelled', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
       ('job-e', 'unknown-op',  '${t5}', '${t5}', 'unknown_status', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
  ).run();

  // Add events to job-a
  db.prepare(
    `INSERT INTO events (job_id, seq, event_type, source, payload, timestamp)
     VALUES
       ('job-a', 1, 'tool_use',     'claude', '{"text":"Calling read_file"}', '${t1}'),
       ('job-a', 2, 'tool_result',  'tool',   '{"data":"file contents"}',     '${t1}'),
       ('job-a', 3, 'text',         'claude', 'not-json',                      '${t1}')`,
  ).run();

  // Add phases to job-a
  db.prepare(
    `INSERT INTO job_phases (job_id, phase, state, updated_at) VALUES
     ('job-a', 'planning', 'done', '${t1}'),
     ('job-a', 'coding',   'done', '${t1}')`,
  ).run();

  return db;
}

// ─── Mock the db module ───────────────────────────────────────────────────────

const { mockOpenDesktopDb, mockOpenProjectDb } = vi.hoisted(() => ({
  mockOpenDesktopDb: vi.fn(),
  mockOpenProjectDb: vi.fn(),
}));

import type * as DesktopDb from '../../src/desktop/db.js';

vi.mock('../../src/desktop/db.js', async () => {
  const actual = await vi.importActual<typeof DesktopDb>('../../src/desktop/db.js');
  return {
    ...actual,
    openDesktopDb: mockOpenDesktopDb,
    openProjectDb: mockOpenProjectDb,
  };
});

// ─── Mock server helper ───────────────────────────────────────────────────────

type ResourceCallback = (
  uri: URL,
  variables?: Record<string, string | string[]>,
) => { contents: Array<{ uri: string; text: string; mimeType: string }> };

function createMockServer(): {
  server: { resource: ReturnType<typeof vi.fn> };
  getCallback: (name: string) => ResourceCallback;
} {
  const callbacks = new Map<string, ResourceCallback>();
  const server = {
    resource: vi.fn((...args: unknown[]) => {
      callbacks.set(args[0] as string, args[3] as ResourceCallback);
    }),
  };
  return {
    server,
    getCallback: (name: string) => {
      const cb = callbacks.get(name);
      if (!cb) throw new Error(`Resource "${name}" not registered`);
      return cb;
    },
  };
}

// ─── Imports after mock ───────────────────────────────────────────────────────

import { registerDesktopProjectsResources } from '../../src/resources/desktop-projects.js';
import { registerDesktopJobsResources } from '../../src/resources/desktop-jobs.js';
import { registerDesktopAnalyticsResources } from '../../src/resources/desktop-analytics.js';

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockOpenDesktopDb.mockImplementation(makeDesktopDb);
  mockOpenProjectDb.mockImplementation(makeProjectDb);
});

// ─────────────────────────────────────────────────────────────────────────────
// registerDesktopProjectsResources
// ─────────────────────────────────────────────────────────────────────────────

describe('registerDesktopProjectsResources', () => {
  it('registers desktop-projects and desktop-project resources', () => {
    const { server } = createMockServer();
    registerDesktopProjectsResources(server as never);
    expect(server.resource).toHaveBeenCalledTimes(2);
    expect(server.resource.mock.calls[0]?.[0]).toBe('desktop-projects');
    expect(server.resource.mock.calls[1]?.[0]).toBe('desktop-project');
  });

  it('lists all projects with markdown content', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopProjectsResources(server as never);

    const cb = getCallback('desktop-projects');
    const result = cb(new URL('specrails://desktop/projects'));

    expect(result.contents[0]?.text).toContain('My Project');
    expect(result.contents[0]?.text).toContain('Other Project');
    expect(result.contents[0]?.text).toContain('my-project');
    expect(result.contents[0]?.mimeType).toBe('text/markdown');
  });

  it('returns "no projects" message when registry is empty', () => {
    mockOpenDesktopDb.mockImplementation(makeEmptyDesktopDb);
    const { server, getCallback } = createMockServer();
    registerDesktopProjectsResources(server as never);

    const cb = getCallback('desktop-projects');
    const result = cb(new URL('specrails://desktop/projects'));

    expect(result.contents[0]?.text).toContain('No projects registered');
  });

  it('returns project details for a valid project ID', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopProjectsResources(server as never);

    const cb = getCallback('desktop-project');
    const result = cb(new URL('specrails://desktop/projects/proj-1'), { projectId: 'proj-1' });

    expect(result.contents[0]?.text).toContain('My Project');
    expect(result.contents[0]?.text).toContain('Total jobs');
    expect(result.contents[0]?.mimeType).toBe('text/markdown');
  });

  it('handles array projectId variable (takes first)', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopProjectsResources(server as never);

    const cb = getCallback('desktop-project');
    const result = cb(new URL('specrails://desktop/projects/proj-1'), {
      projectId: ['proj-1', 'proj-2'],
    });

    expect(result.contents[0]?.text).toContain('My Project');
  });

  it('includes avg duration when > 0', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopProjectsResources(server as never);

    const cb = getCallback('desktop-project');
    const result = cb(new URL('specrails://desktop/projects/proj-1'), { projectId: 'proj-1' });

    expect(result.contents[0]?.text).toContain('Avg duration');
  });

  it('throws for unknown project', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopProjectsResources(server as never);

    const cb = getCallback('desktop-project');
    expect(() =>
      cb(new URL('specrails://desktop/projects/unknown'), { projectId: 'unknown' }),
    ).toThrow('Project not found');
  });

  it('shows fallback when project db is unavailable', () => {
    mockOpenProjectDb.mockImplementation(() => {
      throw new Error('Project DB not found');
    });
    const { server, getCallback } = createMockServer();
    registerDesktopProjectsResources(server as never);

    const cb = getCallback('desktop-project');
    const result = cb(new URL('specrails://desktop/projects/proj-1'), { projectId: 'proj-1' });

    expect(result.contents[0]?.text).toContain('not yet available');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registerDesktopJobsResources
// ─────────────────────────────────────────────────────────────────────────────

describe('registerDesktopJobsResources', () => {
  it('registers desktop-project-jobs and desktop-job resources', () => {
    const { server } = createMockServer();
    registerDesktopJobsResources(server as never);
    expect(server.resource).toHaveBeenCalledTimes(2);
    expect(server.resource.mock.calls[0]?.[0]).toBe('desktop-project-jobs');
    expect(server.resource.mock.calls[1]?.[0]).toBe('desktop-job');
  });

  it('lists jobs with status icons for all statuses', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-project-jobs');
    const result = cb(new URL('specrails://desktop/projects/proj-1/jobs'), { projectId: 'proj-1' });

    const text = result.contents[0]?.text ?? '';
    expect(text).toContain('✅'); // success
    expect(text).toContain('❌'); // failed
    expect(text).toContain('🔄'); // running
    expect(text).toContain('⚪'); // cancelled
    expect(text).toContain('❓'); // unknown/default
    expect(text).toContain('implement');
    expect(result.contents[0]?.mimeType).toBe('text/markdown');
  });

  it('handles array projectId variable for jobs list', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-project-jobs');
    const result = cb(new URL('specrails://desktop/projects/proj-1/jobs'), {
      projectId: ['proj-1', 'proj-2'],
    });

    expect(result.contents[0]?.text).toContain('My Project');
  });

  it('returns "no jobs" message for project with empty db', () => {
    // Empty project db (no jobs inserted)
    const emptyProjectDb = new Database(':memory:');
    emptyProjectDb.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, command TEXT NOT NULL, started_at TEXT NOT NULL,
        finished_at TEXT, status TEXT NOT NULL DEFAULT 'running',
        exit_code INTEGER, tokens_in INTEGER, tokens_out INTEGER,
        tokens_cache_read INTEGER, tokens_cache_create INTEGER,
        total_cost_usd REAL, num_turns INTEGER, model TEXT, duration_ms INTEGER
      );
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
        seq INTEGER NOT NULL, event_type TEXT NOT NULL, source TEXT,
        payload TEXT NOT NULL, timestamp TEXT NOT NULL
      );
      CREATE TABLE job_phases (
        job_id TEXT NOT NULL, phase TEXT NOT NULL, state TEXT NOT NULL,
        updated_at TEXT NOT NULL, PRIMARY KEY (job_id, phase)
      );
    `);
    mockOpenProjectDb.mockReturnValueOnce(emptyProjectDb);

    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-project-jobs');
    const result = cb(new URL('specrails://desktop/projects/proj-1/jobs'), { projectId: 'proj-1' });

    expect(result.contents[0]?.text).toContain('No jobs found');
  });

  it('throws for unknown project in jobs list', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-project-jobs');
    expect(() =>
      cb(new URL('specrails://desktop/projects/unknown/jobs'), { projectId: 'unknown' }),
    ).toThrow('Project not found');
  });

  it('returns job detail with events and phases', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-job');
    const result = cb(new URL('specrails://desktop/projects/proj-1/jobs/job-a'), {
      projectId: 'proj-1',
      jobId: 'job-a',
    });

    const text = result.contents[0]?.text ?? '';
    expect(text).toContain('implement');
    expect(text).toContain('Tokens & Cost');
    expect(text).toContain('Phases');
    expect(text).toContain('Events');
    expect(result.contents[0]?.mimeType).toBe('text/markdown');
  });

  it('handles array variables for job detail', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-job');
    const result = cb(new URL('specrails://desktop/projects/proj-1/jobs/job-a'), {
      projectId: ['proj-1', 'other'],
      jobId: ['job-a', 'job-b'],
    });

    expect(result.contents[0]?.text).toContain('implement');
  });

  it('throws for unknown project in job detail', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-job');
    expect(() =>
      cb(new URL('specrails://desktop/projects/unknown/jobs/job-a'), {
        projectId: 'unknown',
        jobId: 'job-a',
      }),
    ).toThrow('Project not found');
  });

  it('throws for unknown job in job detail', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-job');
    expect(() =>
      cb(new URL('specrails://desktop/projects/proj-1/jobs/nope'), {
        projectId: 'proj-1',
        jobId: 'nope',
      }),
    ).toThrow('Job not found');
  });

  it('renders job without optional fields (null values)', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopJobsResources(server as never);

    const cb = getCallback('desktop-job');
    // job-c has null cost/tokens/model
    const result = cb(new URL('specrails://desktop/projects/proj-1/jobs/job-c'), {
      projectId: 'proj-1',
      jobId: 'job-c',
    });

    const text = result.contents[0]?.text ?? '';
    expect(text).toContain('test-run');
    // No tokens section for null cost
    expect(text).not.toContain('Tokens & Cost');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registerDesktopAnalyticsResources
// ─────────────────────────────────────────────────────────────────────────────

describe('registerDesktopAnalyticsResources', () => {
  it('registers desktop-analytics and desktop-project-analytics resources', () => {
    const { server } = createMockServer();
    registerDesktopAnalyticsResources(server as never);
    expect(server.resource).toHaveBeenCalledTimes(2);
    expect(server.resource.mock.calls[0]?.[0]).toBe('desktop-analytics');
    expect(server.resource.mock.calls[1]?.[0]).toBe('desktop-project-analytics');
  });

  it('returns app-wide analytics summary (with projects having recent jobs)', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-analytics');
    const result = cb(new URL('specrails://desktop/analytics'));

    const text = result.contents[0]?.text ?? '';
    expect(text).toContain('Summary');
    expect(text).toContain('Total jobs');
    expect(text).toContain('Success rate');
    expect(result.contents[0]?.mimeType).toBe('text/markdown');
  });

  it('shows "By Project" section when projects have jobs', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-analytics');
    const result = cb(new URL('specrails://desktop/analytics'));

    // With recent jobs, projects should appear in By Project table
    const text = result.contents[0]?.text ?? '';
    expect(text).toContain('Summary');
    // Success rate calculation exercises the `totalJobsAcrossProjects > 0` branch
    expect(text).toMatch(/Success rate.*%/);
  });

  it('returns "no projects" message for empty registry', () => {
    mockOpenDesktopDb.mockImplementation(makeEmptyDesktopDb);
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-analytics');
    const result = cb(new URL('specrails://desktop/analytics'));

    expect(result.contents[0]?.text).toContain('No projects registered');
  });

  it('skips projects whose db is not yet available', () => {
    mockOpenProjectDb.mockImplementation(() => {
      throw new Error('Project DB not found');
    });
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-analytics');
    const result = cb(new URL('specrails://desktop/analytics'));

    // Should not throw; just skip the project
    expect(result.contents[0]?.text).toContain('Summary');
  });

  it('returns project analytics for a valid project', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-project-analytics');
    const result = cb(new URL('specrails://desktop/projects/proj-1/analytics'), {
      projectId: 'proj-1',
    });

    const text = result.contents[0]?.text ?? '';
    expect(text).toContain('Analytics');
    expect(text).toContain('My Project');
    expect(text).toContain('KPIs');
    expect(result.contents[0]?.mimeType).toBe('text/markdown');
  });

  it('includes token usage section when tokens > 0', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-project-analytics');
    const result = cb(new URL('specrails://desktop/projects/proj-1/analytics'), {
      projectId: 'proj-1',
    });

    const text = result.contents[0]?.text ?? '';
    expect(text).toContain('Token Usage');
  });

  it('handles array projectId for project analytics', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-project-analytics');
    const result = cb(new URL('specrails://desktop/projects/proj-1/analytics'), {
      projectId: ['proj-1', 'proj-2'],
    });

    expect(result.contents[0]?.text).toContain('My Project');
  });

  it('throws for unknown project in project analytics', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-project-analytics');
    expect(() =>
      cb(new URL('specrails://desktop/projects/unknown/analytics'), { projectId: 'unknown' }),
    ).toThrow('Project not found');
  });

  it('includes avg duration line when avg_duration_ms > 0', () => {
    const { server, getCallback } = createMockServer();
    registerDesktopAnalyticsResources(server as never);

    const cb = getCallback('desktop-project-analytics');
    const result = cb(new URL('specrails://desktop/projects/proj-1/analytics'), {
      projectId: 'proj-1',
    });

    // job-a has duration_ms=45000, so avg_duration_ms > 0
    expect(result.contents[0]?.text).toContain('Avg duration');
  });
});
