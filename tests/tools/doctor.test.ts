import { describe, it, expect, vi, beforeEach } from 'vitest';
import { access, readFile } from 'fs/promises';
import { registerDoctorTool } from '../../src/tools/doctor.js';
import type { DoctorResult } from '../../src/tools/doctor.js';

vi.mock('fs/promises');
vi.mock('../../src/utils/provider.js', () => ({
  detectProvider: vi.fn().mockResolvedValue({ provider: 'claude', configDir: '.claude' }),
  instructionsFileName: vi.fn((p: string) => (p === 'codex' ? 'CODEX.md' : 'CLAUDE.md')),
}));

import { detectProvider, instructionsFileName } from '../../src/utils/provider.js';

const mockAccess = vi.mocked(access);
const mockReadFile = vi.mocked(readFile);
const mockDetectProvider = vi.mocked(detectProvider);
const mockInstructionsFileName = vi.mocked(instructionsFileName);

const ROOT = '/project/root';

type ToolCallback = (extra: unknown) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createMockServer(): {
  serverMock: { tool: ReturnType<typeof vi.fn> };
  getCallback: () => ToolCallback | null;
} {
  let capturedCallback: ToolCallback | null = null;

  const serverMock = {
    tool: vi.fn((...args: unknown[]) => {
      // tool(name, description, callback)
      const last = args[args.length - 1];
      if (typeof last === 'function') {
        capturedCallback = last as ToolCallback;
      }
    }),
  };

  return { serverMock, getCallback: () => capturedCallback };
}

describe('registerDoctorTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectProvider.mockResolvedValue({ provider: 'claude', configDir: '.claude' });
    mockInstructionsFileName.mockImplementation((p: string) =>
      p === 'codex' ? 'CODEX.md' : 'CLAUDE.md',
    );
  });

  it('registers a tool named "doctor"', () => {
    const { serverMock } = createMockServer();
    registerDoctorTool(serverMock as never, ROOT);
    expect(serverMock.tool).toHaveBeenCalledOnce();
    expect(serverMock.tool.mock.calls[0][0]).toBe('doctor');
  });

  describe('healthy installation', () => {
    it('returns healthy=true when all checks pass', async () => {
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('content: true' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});

      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;
      expect(parsed.healthy).toBe(true);
      expect(result.isError).toBe(false);
      expect(parsed.checks.every((c) => c.pass)).toBe(true);
    });

    it('returns all six checks', async () => {
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('non-empty' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      expect(parsed.checks).toHaveLength(6);
    });

    it('includes provider field in result', async () => {
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('content' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      expect(parsed.provider).toBe('claude');
    });
  });

  describe('provider-aware checks', () => {
    it('checks .claude/ when provider is claude', async () => {
      mockDetectProvider.mockResolvedValue({ provider: 'claude', configDir: '.claude' });
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('content' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      expect(parsed.checks[0].name).toBe('.claude');
    });

    it('checks .codex/ when provider is codex', async () => {
      mockDetectProvider.mockResolvedValue({ provider: 'codex', configDir: '.codex' });
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('content' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      expect(parsed.checks[0].name).toBe('.codex');
      expect(parsed.provider).toBe('codex');
    });

    it('checks CLAUDE.md for claude provider', async () => {
      mockDetectProvider.mockResolvedValue({ provider: 'claude', configDir: '.claude' });
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('instructions' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      const instrCheck = parsed.checks.find((c) => c.name === 'CLAUDE.md');
      expect(instrCheck).toBeDefined();
    });

    it('checks CODEX.md for codex provider', async () => {
      mockDetectProvider.mockResolvedValue({ provider: 'codex', configDir: '.codex' });
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('instructions' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      const instrCheck = parsed.checks.find((c) => c.name === 'CODEX.md');
      expect(instrCheck).toBeDefined();
    });
  });

  describe('degraded installation', () => {
    it('reports healthy=false and isError=true when config dir is missing', async () => {
      const { serverMock, getCallback } = createMockServer();
      // Only .claude/ is missing
      mockAccess
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
        .mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('content' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      expect(parsed.healthy).toBe(false);
      expect(result.isError).toBe(true);
      expect(parsed.checks[0].pass).toBe(false);
    });

    it('reports fail when config.yaml is empty', async () => {
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile
        .mockResolvedValueOnce('   ' as never) // openspec/config.yaml empty
        .mockResolvedValue('# Claude' as never);

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      const configCheck = parsed.checks.find((c) => c.name === 'openspec/config.yaml');
      expect(configCheck?.pass).toBe(false);
      expect(configCheck?.message).toContain('empty');
    });

    it('reports fail when instructions file is missing', async () => {
      const { serverMock, getCallback } = createMockServer();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile
        .mockResolvedValueOnce('version: 1' as never) // config.yaml ok
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      registerDoctorTool(serverMock as never, ROOT);
      const result = await getCallback()!({});
      const parsed: DoctorResult = JSON.parse(result.content[0].text) as DoctorResult;

      const instrCheck = parsed.checks.find((c) => c.name === 'CLAUDE.md');
      expect(instrCheck?.pass).toBe(false);
    });
  });

  it('returns content with type=text', async () => {
    const { serverMock, getCallback } = createMockServer();
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('ok' as never);

    registerDoctorTool(serverMock as never, ROOT);
    const result = await getCallback()!({});

    expect(result.content[0].type).toBe('text');
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });
});
