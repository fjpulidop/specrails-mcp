import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { access } from 'fs/promises';
import { detectProvider, instructionsFileName } from '../../src/utils/provider.js';

vi.mock('fs/promises');

const mockAccess = vi.mocked(access);

const ROOT = '/project/root';

describe('detectProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['SPECRAILS_CLI_PROVIDER'];
  });

  afterEach(() => {
    delete process.env['SPECRAILS_CLI_PROVIDER'];
  });

  describe('env var override', () => {
    it('returns claude when SPECRAILS_CLI_PROVIDER=claude', async () => {
      process.env['SPECRAILS_CLI_PROVIDER'] = 'claude';
      const result = await detectProvider(ROOT);
      expect(result).toEqual({ provider: 'claude', configDir: '.claude' });
      expect(mockAccess).not.toHaveBeenCalled();
    });

    it('returns codex when SPECRAILS_CLI_PROVIDER=codex', async () => {
      process.env['SPECRAILS_CLI_PROVIDER'] = 'codex';
      const result = await detectProvider(ROOT);
      expect(result).toEqual({ provider: 'codex', configDir: '.codex' });
      expect(mockAccess).not.toHaveBeenCalled();
    });

    it('falls through to filesystem detection for unknown env value', async () => {
      process.env['SPECRAILS_CLI_PROVIDER'] = 'unknown';
      mockAccess.mockResolvedValueOnce(undefined); // .claude exists
      const result = await detectProvider(ROOT);
      expect(result).toEqual({ provider: 'claude', configDir: '.claude' });
    });
  });

  describe('filesystem detection', () => {
    it('returns claude when .claude/ exists', async () => {
      mockAccess.mockResolvedValueOnce(undefined); // .claude exists
      const result = await detectProvider(ROOT);
      expect(result).toEqual({ provider: 'claude', configDir: '.claude' });
    });

    it('returns codex when only .codex/ exists', async () => {
      mockAccess
        .mockRejectedValueOnce(new Error('ENOENT')) // .claude missing
        .mockResolvedValueOnce(undefined); // .codex exists
      const result = await detectProvider(ROOT);
      expect(result).toEqual({ provider: 'codex', configDir: '.codex' });
    });

    it('defaults to claude when neither directory exists', async () => {
      mockAccess
        .mockRejectedValueOnce(new Error('ENOENT')) // .claude missing
        .mockRejectedValueOnce(new Error('ENOENT')); // .codex missing
      const result = await detectProvider(ROOT);
      expect(result).toEqual({ provider: 'claude', configDir: '.claude' });
    });

    it('prefers .claude when both directories exist', async () => {
      mockAccess.mockResolvedValue(undefined); // both exist
      const result = await detectProvider(ROOT);
      expect(result).toEqual({ provider: 'claude', configDir: '.claude' });
    });
  });
});

describe('instructionsFileName', () => {
  it('returns CLAUDE.md for claude provider', () => {
    expect(instructionsFileName('claude')).toBe('CLAUDE.md');
  });

  it('returns CODEX.md for codex provider', () => {
    expect(instructionsFileName('codex')).toBe('CODEX.md');
  });
});
