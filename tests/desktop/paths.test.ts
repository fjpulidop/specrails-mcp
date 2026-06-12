import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';

// ─── Mock node:fs and node:os ─────────────────────────────────────────────────

const { fsExistsSyncMock } = vi.hoisted(() => ({
  fsExistsSyncMock: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: fsExistsSyncMock,
  },
}));

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/home/test',
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  getDesktopDbPath,
  getProjectDbPath,
  getDesktopApiBase,
  openDesktopDb,
} from '../../src/desktop/db.js';

const desktopPath = path.join('/home/test', '.specrails', 'desktop.sqlite');
const legacyPath = path.join('/home/test', '.specrails', 'hub.sqlite');

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getDesktopDbPath ─────────────────────────────────────────────────────────

describe('getDesktopDbPath', () => {
  it('returns desktop.sqlite when it exists', () => {
    fsExistsSyncMock.mockImplementation((p: string) => p === desktopPath);
    expect(getDesktopDbPath()).toBe(desktopPath);
  });

  it('falls back to legacy hub.sqlite when desktop.sqlite is missing (pre-rebrand desktop)', () => {
    fsExistsSyncMock.mockImplementation((p: string) => p === legacyPath);
    expect(getDesktopDbPath()).toBe(legacyPath);
  });

  it('returns desktop.sqlite when neither file exists', () => {
    fsExistsSyncMock.mockReturnValue(false);
    expect(getDesktopDbPath()).toBe(desktopPath);
  });
});

// ─── getProjectDbPath / getDesktopApiBase ─────────────────────────────────────

describe('getProjectDbPath', () => {
  it('builds the per-project jobs.sqlite path', () => {
    expect(getProjectDbPath('my-proj')).toBe(
      path.join('/home/test', '.specrails', 'projects', 'my-proj', 'jobs.sqlite'),
    );
  });
});

describe('getDesktopApiBase', () => {
  it('returns the default desktop server address', () => {
    expect(getDesktopApiBase()).toBe('http://localhost:4200');
  });
});

// ─── openDesktopDb ────────────────────────────────────────────────────────────

describe('openDesktopDb', () => {
  it('throws a descriptive error when no database file exists', () => {
    fsExistsSyncMock.mockReturnValue(false);
    expect(() => openDesktopDb()).toThrow('Specrails Desktop database not found');
  });
});
