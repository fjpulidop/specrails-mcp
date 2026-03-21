import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock node:fs ─────────────────────────────────────────────────────────────

const { fsExistsSyncMock, fsReadFileSyncMock } = vi.hoisted(() => ({
  fsExistsSyncMock: vi.fn(),
  fsReadFileSyncMock: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: fsExistsSyncMock,
    readFileSync: fsReadFileSyncMock,
  },
}));

// ─── Mock hub/db.js ───────────────────────────────────────────────────────────

const { mockOpenHubDb, mockQueryProjects, mockGetHubApiBase } = vi.hoisted(() => ({
  mockOpenHubDb: vi.fn(),
  mockQueryProjects: vi.fn(),
  mockGetHubApiBase: vi.fn(),
}));

vi.mock('../../src/hub/db.js', () => ({
  openHubDb: mockOpenHubDb,
  queryProjects: mockQueryProjects,
  getHubApiBase: mockGetHubApiBase,
}));

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { getHubStatus, registerHubStatusTool } from '../../src/tools/hub-status.js';

// ─── Shared mock DB object ────────────────────────────────────────────────────

const mockDb = { close: vi.fn() };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: db available with 2 projects
  mockOpenHubDb.mockReturnValue(mockDb);
  mockQueryProjects.mockReturnValue([
    { id: 'proj-1', slug: 'my-project', name: 'My Project' },
    { id: 'proj-2', slug: 'other', name: 'Other' },
  ]);
  mockGetHubApiBase.mockReturnValue('http://localhost:4200');

  // Default: no pid file
  fsExistsSyncMock.mockReturnValue(false);

  // Default: server not reachable
  globalThis.fetch = mockFetch as typeof fetch;
  mockFetch.mockRejectedValue(new Error('Connection refused'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getHubStatus tests ───────────────────────────────────────────────────────

describe('getHubStatus', () => {
  it('returns db info when hub database exists', async () => {
    const result = await getHubStatus();
    expect(result.hubDbExists).toBe(true);
    expect(result.projectCount).toBe(2);
  });

  it('returns hubDbExists=false when openHubDb throws', async () => {
    mockOpenHubDb.mockImplementation(() => {
      throw new Error('DB not found');
    });
    const result = await getHubStatus();
    expect(result.hubDbExists).toBe(false);
    expect(result.projectCount).toBe(0);
  });

  it('returns pidFileExists=false when pid file does not exist', async () => {
    const result = await getHubStatus();
    expect(result.pidFileExists).toBe(false);
    expect(result.pid).toBeNull();
  });

  it('reads pid when pid file exists', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReadFileSyncMock.mockReturnValue('12345\n');

    const result = await getHubStatus();
    expect(result.pidFileExists).toBe(true);
    expect(result.pid).toBe(12345);
  });

  it('returns pid=null when pid file content is invalid', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReadFileSyncMock.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = await getHubStatus();
    expect(result.pidFileExists).toBe(true);
    expect(result.pid).toBeNull();
  });

  it('returns serverReachable=false when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await getHubStatus();
    expect(result.serverReachable).toBe(false);
  });

  it('returns serverReachable=true when fetch returns ok', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const result = await getHubStatus();
    expect(result.serverReachable).toBe(true);
    expect(result.serverUrl).toBe('http://localhost:4200');
  });

  it('returns serverReachable=false when fetch returns not-ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);
    const result = await getHubStatus();
    expect(result.serverReachable).toBe(false);
  });

  it('includes serverUrl in result', async () => {
    const result = await getHubStatus();
    expect(result.serverUrl).toBe('http://localhost:4200');
  });
});

// ─── registerHubStatusTool tests ─────────────────────────────────────────────

describe('registerHubStatusTool', () => {
  it('registers hub_status tool', () => {
    const server = { tool: vi.fn() };
    registerHubStatusTool(server as never);
    expect(server.tool).toHaveBeenCalledOnce();
    expect(server.tool.mock.calls[0]?.[0]).toBe('hub_status');
  });

  it('handler returns formatted status text', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReadFileSyncMock.mockReturnValue('9999');
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const server = { tool: vi.fn() };
    registerHubStatusTool(server as never);

    // Extract and invoke the registered handler
    const handler = server.tool.mock.calls[0]?.[3] as () => Promise<{
      content: Array<{ type: string; text: string }>;
    }>;
    const result = await handler();

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('specrails-hub Status');
    expect(text).toContain('Hub DB');
    expect(text).toContain('Projects');
    expect(text).toContain('Server');
    expect(text).toContain('PID file');
  });

  it('handler shows db not found status', async () => {
    mockOpenHubDb.mockImplementation(() => {
      throw new Error('DB not found');
    });
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const server = { tool: vi.fn() };
    registerHubStatusTool(server as never);

    const handler = server.tool.mock.calls[0]?.[3] as () => Promise<{
      content: Array<{ type: string; text: string }>;
    }>;
    const result = await handler();

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('not found');
    expect(text).toContain('not reachable');
  });
});
