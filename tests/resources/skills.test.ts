import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdir, readFile, access } from 'fs/promises';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSkillsResources } from '../../src/resources/skills.js';

vi.mock('fs/promises');
vi.mock('../../src/utils/provider.js', () => ({
  detectProvider: vi.fn().mockResolvedValue({ provider: 'claude', configDir: '.claude' }),
}));

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockAccess = vi.mocked(access);

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

describe('registerSkillsResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['SPECRAILS_CLI_PROVIDER'];
  });

  afterEach(() => {
    delete process.env['SPECRAILS_CLI_PROVIDER'];
  });

  it('registers a resource template named "skill"', () => {
    const { serverMock } = createMockServer();
    registerSkillsResources(serverMock as never, ROOT);
    expect(serverMock.resource).toHaveBeenCalledOnce();
    expect(serverMock.resource.mock.calls[0][0]).toBe('skill');
    expect(serverMock.resource.mock.calls[0][1]).toBeInstanceOf(ResourceTemplate);
  });

  describe('list callback', () => {
    it('returns skill directories that contain SKILL.md', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockResolvedValue(['sr-implement', 'sr-health-check', 'README.md'] as never);
      mockAccess
        .mockResolvedValueOnce(undefined) // sr-implement/SKILL.md exists
        .mockResolvedValueOnce(undefined) // sr-health-check/SKILL.md exists
        .mockRejectedValueOnce(new Error('ENOENT')); // README.md/SKILL.md missing

      registerSkillsResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(2);
      expect(result.resources[0].uri).toBe('specrails://skills/sr-implement');
      expect(result.resources[0].mimeType).toBe('text/markdown');
      expect(result.resources[1].uri).toBe('specrails://skills/sr-health-check');
    });

    it('returns empty list when skills directory does not exist', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      registerSkillsResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(0);
    });

    it('returns empty list when no directory has SKILL.md', async () => {
      const { serverMock, getTemplate } = createMockServer();
      mockReaddir.mockResolvedValue(['notes'] as never);
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      registerSkillsResources(serverMock as never, ROOT);
      const result = await getTemplate()!.listCallback!({} as never);

      expect(result.resources).toHaveLength(0);
    });
  });

  describe('read callback', () => {
    it('reads SKILL.md and returns its content', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      mockReadFile.mockResolvedValue('# sr-implement\n\nImplement a feature.' as never);

      registerSkillsResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;
      const result = await cb(
        new URL('specrails://skills/sr-implement'),
        { name: 'sr-implement' },
        {},
      );

      expect(result.contents[0].text).toBe('# sr-implement\n\nImplement a feature.');
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('SKILL.md'), 'utf-8');
    });

    it('throws for skill names with path separators', async () => {
      const { serverMock, getReadCallback } = createMockServer();
      registerSkillsResources(serverMock as never, ROOT);
      const cb = getReadCallback()!;

      await expect(
        cb(new URL('specrails://skills/bad'), { name: '../etc/passwd' }, {}),
      ).rejects.toThrow('Invalid skill name');
    });
  });
});
