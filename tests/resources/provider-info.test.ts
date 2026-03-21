import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerProviderInfoResource } from '../../src/resources/provider-info.js';

vi.mock('../../src/utils/provider.js', () => ({
  detectProvider: vi.fn(),
}));

import { detectProvider } from '../../src/utils/provider.js';

const mockDetectProvider = vi.mocked(detectProvider);

const ROOT = '/project/root';

type StaticResourceCallback = (
  resourceUri: URL,
  extra: unknown,
) => Promise<{ contents: Array<{ uri: string; text: string; mimeType: string }> }>;

function createMockServer(): {
  serverMock: { resource: ReturnType<typeof vi.fn> };
  getCallback: () => StaticResourceCallback | null;
} {
  let capturedCallback: StaticResourceCallback | null = null;

  const serverMock = {
    resource: vi.fn((...args: unknown[]) => {
      const last = args[args.length - 1];
      if (typeof last === 'function') {
        capturedCallback = last as StaticResourceCallback;
      }
    }),
  };

  return { serverMock, getCallback: () => capturedCallback };
}

describe('registerProviderInfoResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['SPECRAILS_CLI_PROVIDER'];
  });

  afterEach(() => {
    delete process.env['SPECRAILS_CLI_PROVIDER'];
  });

  it('registers a resource named "provider-info"', () => {
    const { serverMock } = createMockServer();
    registerProviderInfoResource(serverMock as never, ROOT);
    expect(serverMock.resource).toHaveBeenCalledOnce();
    expect(serverMock.resource.mock.calls[0][0]).toBe('provider-info');
    expect(serverMock.resource.mock.calls[0][1]).toBe('specrails://provider');
  });

  it('returns JSON with claude provider info', async () => {
    const { serverMock, getCallback } = createMockServer();
    mockDetectProvider.mockResolvedValue({ provider: 'claude', configDir: '.claude' });

    registerProviderInfoResource(serverMock as never, ROOT);
    const result = await getCallback()!(new URL('specrails://provider'), {});

    const parsed = JSON.parse(result.contents[0].text) as { provider: string; configDir: string };
    expect(parsed.provider).toBe('claude');
    expect(parsed.configDir).toBe('.claude');
    expect(result.contents[0].mimeType).toBe('application/json');
  });

  it('returns JSON with codex provider info', async () => {
    const { serverMock, getCallback } = createMockServer();
    mockDetectProvider.mockResolvedValue({ provider: 'codex', configDir: '.codex' });

    registerProviderInfoResource(serverMock as never, ROOT);
    const result = await getCallback()!(new URL('specrails://provider'), {});

    const parsed = JSON.parse(result.contents[0].text) as { provider: string; configDir: string };
    expect(parsed.provider).toBe('codex');
    expect(parsed.configDir).toBe('.codex');
  });

  it('returns the correct URI in content', async () => {
    const { serverMock, getCallback } = createMockServer();
    mockDetectProvider.mockResolvedValue({ provider: 'claude', configDir: '.claude' });

    registerProviderInfoResource(serverMock as never, ROOT);
    const result = await getCallback()!(new URL('specrails://provider'), {});

    expect(result.contents[0].uri).toBe('specrails://provider');
  });
});
