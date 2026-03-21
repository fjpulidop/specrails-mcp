import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdir, readFile } from 'fs/promises';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChangesResources } from '../../src/resources/changes.js';

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

describe('registerChangesResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a resource template named "change"', () => {
    const { serverMock } = createMockServer();
    registerChangesResources(serverMock as never, ROOT);
    expect(serverMock.resource).toHaveBeenCalledOnce();
    expect(serverMock.resource.mock.calls[0][0]).toBe('change');
    expect(serverMock.resource.mock.calls[0][1]).toBeInstanceOf(ResourceTemplate);
  });

  describe('list callback', () => {
    it('returns yaml and md change files', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockResolvedValue(['2024-01-add-auth.yaml', 'notes.txt'] as never);

      registerChangesResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe('specrails://changes/2024-01-add-auth.yaml');
      expect(result.resources[0].mimeType).toBe('text/yaml');
    });

    it('returns empty list when directory does not exist', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      registerChangesResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(0);
    });
  });

  describe('read callback', () => {
    it('reads a change file and returns its content', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      mockReadFile.mockResolvedValue('change content' as never);

      registerChangesResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;
      const result = await cb(
        new URL('specrails://changes/2024-01-add-auth.yaml'),
        { name: '2024-01-add-auth.yaml' },
        {},
      );

      expect(result.contents[0].text).toBe('change content');
      expect(result.contents[0].mimeType).toBe('text/yaml');
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('2024-01-add-auth.yaml'),
        'utf-8',
      );
    });

    it('throws for names with path separators', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      registerChangesResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;

      await expect(
        cb(new URL('specrails://changes/bad'), { name: '../etc/passwd' }, {}),
      ).rejects.toThrow('Invalid change name');
    });
  });
});
