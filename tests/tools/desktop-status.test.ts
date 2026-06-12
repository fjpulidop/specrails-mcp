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

// ─── Mock desktop/db.js ───────────────────────────────────────────────────────────

const { mockOpenDesktopDb, mockQueryProjects, mockGetDesktopApiBase } = vi.hoisted(() => ({
  mockOpenDesktopDb: vi.fn(),
  mockQueryProjects: vi.fn(),
  mockGetDesktopApiBase: vi.fn(),
}));

vi.mock('../../src/desktop/db.js', () => ({
  openDesktopDb: mockOpenDesktopDb,
  queryProjects: mockQueryProjects,
  getDesktopApiBase: mockGetDesktopApiBase,
}));

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { getDesktopStatus, registerDesktopStatusTool } from '../../src/tools/desktop-status.js';

// ─── Shared mock DB object ────────────────────────────────────────────────────

const mockDb = { close: vi.fn() };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: db available with 2 projects
  mockOpenDesktopDb.mockReturnValue(mockDb);
  mockQueryProjects.mockReturnValue([
    { id: 'proj-1', slug: 'my-project', name: 'My Project' },
    { id: 'proj-2', slug: 'other', name: 'Other' },
  ]);
  mockGetDesktopApiBase.mockReturnValue('http://localhost:4200');

  // Default: no pid file
  fsExistsSyncMock.mockReturnValue(false);

  // Default: server not reachable
  globalThis.fetch = mockFetch as typeof fetch;
  mockFetch.mockRejectedValue(new Error('Connection refused'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getDesktopStatus tests ───────────────────────────────────────────────────────

describe('getDesktopStatus', () => {
  it('returns db info when desktop database exists', async () => {
    const result = await getDesktopStatus();
    expect(result.desktopDbExists).toBe(true);
    expect(result.projectCount).toBe(2);
  });

  it('returns desktopDbExists=false when openDesktopDb throws', async () => {
    mockOpenDesktopDb.mockImplementation(() => {
      throw new Error('DB not found');
    });
    const result = await getDesktopStatus();
    expect(result.desktopDbExists).toBe(false);
    expect(result.projectCount).toBe(0);
  });

  it('returns pidFileExists=false when pid file does not exist', async () => {
    const result = await getDesktopStatus();
    expect(result.pidFileExists).toBe(false);
    expect(result.pid).toBeNull();
  });

  it('reads pid when pid file exists', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReadFileSyncMock.mockReturnValue('12345\n');

    const result = await getDesktopStatus();
    expect(result.pidFileExists).toBe(true);
    expect(result.pid).toBe(12345);
  });

  it('returns pid=null when pid file content is invalid', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReadFileSyncMock.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = await getDesktopStatus();
    expect(result.pidFileExists).toBe(true);
    expect(result.pid).toBeNull();
  });

  it('returns serverReachable=false when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await getDesktopStatus();
    expect(result.serverReachable).toBe(false);
  });

  it('returns serverReachable=true when fetch returns ok', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const result = await getDesktopStatus();
    expect(result.serverReachable).toBe(true);
    expect(result.serverUrl).toBe('http://localhost:4200');
  });

  it('returns serverReachable=true on a 401 (auth-gated /api/state still proves the server is up)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 } as Response);
    const result = await getDesktopStatus();
    expect(result.serverReachable).toBe(true);
  });

  it('returns serverReachable=true on a 404 (pre-rebrand desktop without /api/state)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const result = await getDesktopStatus();
    expect(result.serverReachable).toBe(true);
  });

  it('probes the /api/state endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    await getDesktopStatus();
    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://localhost:4200/api/state');
  });

  it('includes serverUrl in result', async () => {
    const result = await getDesktopStatus();
    expect(result.serverUrl).toBe('http://localhost:4200');
  });
});

// ─── registerDesktopStatusTool tests ─────────────────────────────────────────────

describe('registerDesktopStatusTool', () => {
  it('registers desktop_status tool', () => {
    const server = { tool: vi.fn() };
    registerDesktopStatusTool(server as never);
    expect(server.tool).toHaveBeenCalledOnce();
    expect(server.tool.mock.calls[0]?.[0]).toBe('desktop_status');
  });

  it('handler returns formatted status text', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReadFileSyncMock.mockReturnValue('9999');
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const server = { tool: vi.fn() };
    registerDesktopStatusTool(server as never);

    // Extract and invoke the registered handler
    const handler = server.tool.mock.calls[0]?.[3] as () => Promise<{
      content: Array<{ type: string; text: string }>;
    }>;
    const result = await handler();

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Specrails Desktop Status');
    expect(text).toContain('Desktop DB');
    expect(text).toContain('Projects');
    expect(text).toContain('Server');
    expect(text).toContain('PID file');
  });

  it('handler shows db not found status', async () => {
    mockOpenDesktopDb.mockImplementation(() => {
      throw new Error('DB not found');
    });
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const server = { tool: vi.fn() };
    registerDesktopStatusTool(server as never);

    const handler = server.tool.mock.calls[0]?.[3] as () => Promise<{
      content: Array<{ type: string; text: string }>;
    }>;
    const result = await handler();

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('not found');
    expect(text).toContain('not reachable');
  });
});
