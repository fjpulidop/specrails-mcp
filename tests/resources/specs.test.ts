import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdir, readFile } from 'fs/promises';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSpecsResources } from '../../src/resources/specs.js';

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

describe('registerSpecsResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a resource template named "spec"', () => {
    const { serverMock } = createMockServer();
    registerSpecsResources(serverMock as never, ROOT);
    expect(serverMock.resource).toHaveBeenCalledOnce();
    expect(serverMock.resource.mock.calls[0][0]).toBe('spec');
    expect(serverMock.resource.mock.calls[0][1]).toBeInstanceOf(ResourceTemplate);
  });

  describe('list callback', () => {
    it('returns yaml and md files from openspec/specs/', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockResolvedValue(['auth.yaml', 'README.md', 'notes.txt'] as never);

      registerSpecsResources(serverMock as never, ROOT);
      const template = getTemplate()!;
      const result = await template.listCallback!({} as never);

      expect(result.resources).toHaveLength(2);
      expect(result.resources[0].uri).toBe('specrails://specs/auth.yaml');
      expect(result.resources[0].mimeType).toBe('text/yaml');
      expect(result.resources[1].uri).toBe('specrails://specs/README.md');
      expect(result.resources[1].mimeType).toBe('text/markdown');
    });

    it('returns empty list when directory does not exist', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      registerSpecsResources(serverMock as never, ROOT);
      const template = getTemplate()!;
      const result = await template.listCallback!({} as never);

      expect(result.resources).toHaveLength(0);
    });

    it('returns json files with correct mimeType', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockResolvedValue(['schema.json'] as never);

      registerSpecsResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources[0].mimeType).toBe('application/json');
    });
  });

  describe('read callback', () => {
    it('reads a yaml spec file and returns its content', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      mockReadFile.mockResolvedValue('spec content here' as never);

      registerSpecsResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;
      const result = await cb(new URL('specrails://specs/auth.yaml'), { name: 'auth.yaml' }, {});

      expect(result.contents[0].text).toBe('spec content here');
      expect(result.contents[0].mimeType).toBe('text/yaml');
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('auth.yaml'), 'utf-8');
    });

    it('reads a markdown spec file with correct mimeType', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      mockReadFile.mockResolvedValue('# Spec' as never);

      registerSpecsResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;
      const result = await cb(new URL('specrails://specs/spec.md'), { name: 'spec.md' }, {});

      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('throws for names with path separators', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      registerSpecsResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;

      await expect(
        cb(new URL('specrails://specs/bad'), { name: '../etc/passwd' }, {}),
      ).rejects.toThrow('Invalid spec name');
    });

    it('handles array-valued variables by taking first element', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      mockReadFile.mockResolvedValue('content' as never);

      registerSpecsResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;
      const result = await cb(
        new URL('specrails://specs/auth.yaml'),
        { name: ['auth.yaml', 'other.yaml'] },
        {},
      );

      expect(result.contents[0].text).toBe('content');
    });
  });
});
