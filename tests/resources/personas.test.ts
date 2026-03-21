import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdir, readFile } from 'fs/promises';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPersonasResources } from '../../src/resources/personas.js';

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

describe('registerPersonasResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a resource template named "persona"', () => {
    const { serverMock } = createMockServer();
    registerPersonasResources(serverMock as never, ROOT);
    expect(serverMock.resource).toHaveBeenCalledOnce();
    expect(serverMock.resource.mock.calls[0][0]).toBe('persona');
    expect(serverMock.resource.mock.calls[0][1]).toBeInstanceOf(ResourceTemplate);
  });

  describe('list callback', () => {
    it('returns md and yaml persona files', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockResolvedValue(['engineer.md', 'pm.yaml', 'notes.txt'] as never);

      registerPersonasResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(2);
      expect(result.resources[0].uri).toBe('specrails://personas/engineer.md');
      expect(result.resources[0].mimeType).toBe('text/markdown');
      expect(result.resources[1].uri).toBe('specrails://personas/pm.yaml');
      expect(result.resources[1].mimeType).toBe('text/yaml');
    });

    it('returns empty list when directory does not exist', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      registerPersonasResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(0);
    });
  });

  describe('read callback', () => {
    it('reads a persona file and returns its content', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      mockReadFile.mockResolvedValue('# Engineer persona' as never);

      registerPersonasResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;
      const result = await cb(
        new URL('specrails://personas/engineer.md'),
        { name: 'engineer.md' },
        {},
      );

      expect(result.contents[0].text).toBe('# Engineer persona');
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('engineer.md'), 'utf-8');
    });

    it('throws for names with path separators', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      registerPersonasResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;

      await expect(
        cb(new URL('specrails://personas/bad'), { name: '../etc/passwd' }, {}),
      ).rejects.toThrow('Invalid persona name');
    });
  });
});
