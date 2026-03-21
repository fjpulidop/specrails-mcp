import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'fs/promises';
import { registerConfigResources } from '../../src/resources/config.js';

vi.mock('fs/promises');
vi.mock('../../src/utils/provider.js', () => ({
  detectProvider: vi.fn().mockResolvedValue({ provider: 'claude', configDir: '.claude' }),
  instructionsFileName: vi.fn((p: string) => (p === 'codex' ? 'CODEX.md' : 'CLAUDE.md')),
}));

import { detectProvider, instructionsFileName } from '../../src/utils/provider.js';

const mockReadFile = vi.mocked(readFile);
const mockDetectProvider = vi.mocked(detectProvider);
const mockInstructionsFileName = vi.mocked(instructionsFileName);
const ROOT = '/project/root';

type StaticReadCallback = (
  uri: URL,
  extra: unknown,
) => Promise<{ contents: Array<{ uri: string; text: string; mimeType: string }> }>;

function createMockServer(): {
  serverMock: { resource: ReturnType<typeof vi.fn> };
  getCallbackByUri: (uri: string) => StaticReadCallback | null;
} {
  const registered: Array<{ name: string; uri: string; callback: StaticReadCallback }> = [];

  const serverMock = {
    resource: vi.fn((...args: unknown[]) => {
      if (typeof args[1] === 'string') {
        const uri = args[1];
        const callback =
          typeof args[3] === 'function'
            ? (args[3] as StaticReadCallback)
            : (args[2] as StaticReadCallback);
        registered.push({ name: args[0] as string, uri, callback });
      }
    }),
  };

  return {
    serverMock,
    getCallbackByUri: (uri: string) => registered.find((r) => r.uri === uri)?.callback ?? null,
  };
}

describe('registerConfigResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectProvider.mockResolvedValue({ provider: 'claude', configDir: '.claude' });
    mockInstructionsFileName.mockImplementation((p: string) =>
      p === 'codex' ? 'CODEX.md' : 'CLAUDE.md',
    );
  });

  it('registers two config resources', () => {
    const { serverMock } = createMockServer();
    registerConfigResources(serverMock as never, ROOT);
    expect(serverMock.resource).toHaveBeenCalledTimes(2);
  });

  it('registers specrails://config/openspec', () => {
    const { serverMock } = createMockServer();
    registerConfigResources(serverMock as never, ROOT);
    const uris = serverMock.resource.mock.calls.map((c) => c[1]);
    expect(uris).toContain('specrails://config/openspec');
  });

  it('registers specrails://config/instructions', () => {
    const { serverMock } = createMockServer();
    registerConfigResources(serverMock as never, ROOT);
    const uris = serverMock.resource.mock.calls.map((c) => c[1]);
    expect(uris).toContain('specrails://config/instructions');
  });

  describe('openspec config read callback', () => {
    it('reads openspec/config.yaml and returns yaml content', async () => {
      const { serverMock, getCallbackByUri } = createMockServer();
      mockReadFile.mockResolvedValue('version: 1' as never);

      registerConfigResources(serverMock as never, ROOT);
      const cb = getCallbackByUri('specrails://config/openspec')!;
      const result = await cb(new URL('specrails://config/openspec'), {});

      expect(result.contents[0].text).toBe('version: 1');
      expect(result.contents[0].mimeType).toBe('text/yaml');
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('config.yaml'), 'utf-8');
    });

    it('propagates read errors (file not found)', async () => {
      const { serverMock, getCallbackByUri } = createMockServer();
      mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      registerConfigResources(serverMock as never, ROOT);
      const cb = getCallbackByUri('specrails://config/openspec')!;

      await expect(cb(new URL('specrails://config/openspec'), {})).rejects.toThrow('ENOENT');
    });
  });

  describe('instructions read callback', () => {
    it('reads CLAUDE.md when provider is claude', async () => {
      mockDetectProvider.mockResolvedValue({ provider: 'claude', configDir: '.claude' });
      const { serverMock, getCallbackByUri } = createMockServer();
      mockReadFile.mockResolvedValue('# Claude instructions' as never);

      registerConfigResources(serverMock as never, ROOT);
      const cb = getCallbackByUri('specrails://config/instructions')!;
      const result = await cb(new URL('specrails://config/instructions'), {});

      expect(result.contents[0].text).toBe('# Claude instructions');
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('CLAUDE.md'), 'utf-8');
    });

    it('reads CODEX.md when provider is codex', async () => {
      mockDetectProvider.mockResolvedValue({ provider: 'codex', configDir: '.codex' });
      const { serverMock, getCallbackByUri } = createMockServer();
      mockReadFile.mockResolvedValue('# Codex instructions' as never);

      registerConfigResources(serverMock as never, ROOT);
      const cb = getCallbackByUri('specrails://config/instructions')!;
      const result = await cb(new URL('specrails://config/instructions'), {});

      expect(result.contents[0].text).toBe('# Codex instructions');
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('CODEX.md'), 'utf-8');
    });
  });
});
