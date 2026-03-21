import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdir, readFile } from 'fs/promises';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemoryResources } from '../../src/resources/memory.js';

vi.mock('fs/promises');

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

const ROOT = '/project/root';

type ResourceTemplateCallback = (
  uri: URL,
  variables: Record<string, string | string[]>,
  extra: unknown,
) => Promise<{ contents: Array<{ uri: string; text: string; mimeType: string }> }>;

function createMockServer(): {
  serverMock: { resource: ReturnType<typeof vi.fn> };
  getTemplate: () => ResourceTemplate | null;
  getReadCallback: () => ResourceTemplateCallback | null;
} {
  let capturedTemplate: ResourceTemplate | null = null;
  let capturedReadCallback: ResourceTemplateCallback | null = null;

  const serverMock = {
    resource: vi.fn((...args: unknown[]) => {
      if (args[1] instanceof ResourceTemplate) {
        capturedTemplate = args[1];
        capturedReadCallback =
          typeof args[3] === 'function'
            ? (args[3] as ResourceTemplateCallback)
            : typeof args[2] === 'function'
              ? (args[2] as ResourceTemplateCallback)
              : null;
      }
    }),
  };

  return {
    serverMock,
    getTemplate: () => capturedTemplate,
    getReadCallback: () => capturedReadCallback,
  };
}

describe('registerMemoryResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a resource template named "memory"', () => {
    const { serverMock } = createMockServer();
    registerMemoryResources(serverMock as never, ROOT);
    expect(serverMock.resource).toHaveBeenCalledOnce();
    expect(serverMock.resource.mock.calls[0][0]).toBe('memory');
    expect(serverMock.resource.mock.calls[0][1]).toBeInstanceOf(ResourceTemplate);
  });

  describe('list callback', () => {
    it('returns md, yaml, and txt memory files', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockResolvedValue(['notes.md', 'context.yaml', 'log.txt', 'binary.bin'] as never);

      registerMemoryResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(3);
      expect(result.resources[0].uri).toBe('specrails://memory/notes.md');
      expect(result.resources[0].mimeType).toBe('text/markdown');
      expect(result.resources[1].mimeType).toBe('text/yaml');
      expect(result.resources[2].mimeType).toBe('text/plain');
    });

    it('returns empty list when directory does not exist', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      registerMemoryResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(0);
    });
  });

  describe('read callback', () => {
    it('reads a memory file and returns its content', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      mockReadFile.mockResolvedValue('memory content' as never);

      registerMemoryResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;
      const result = await cb(new URL('specrails://memory/notes.md'), { name: 'notes.md' }, {});

      expect(result.contents[0].text).toBe('memory content');
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('notes.md'), 'utf-8');
    });

    it('reads a txt file with text/plain mimeType', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      mockReadFile.mockResolvedValue('plain text' as never);

      registerMemoryResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;
      const result = await cb(new URL('specrails://memory/log.txt'), { name: 'log.txt' }, {});

      expect(result.contents[0].mimeType).toBe('text/plain');
    });

    it('throws for names with path separators', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      registerMemoryResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;

      await expect(
        cb(new URL('specrails://memory/bad'), { name: '../etc/passwd' }, {}),
      ).rejects.toThrow('Invalid memory name');
    });
  });
});
