import { access, constants } from 'fs/promises';
import { resolve } from 'path';

export type CliProvider = 'claude' | 'codex';

export interface ProviderInfo {
  provider: CliProvider;
  configDir: '.claude' | '.codex';
}

function configDirForProvider(provider: CliProvider): '.claude' | '.codex' {
  return provider === 'codex' ? '.codex' : '.claude';
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects the active CLI provider for the given project root.
 *
 * Resolution order:
 * 1. SPECRAILS_CLI_PROVIDER env var ("claude" | "codex")
 * 2. Filesystem: .claude/ exists → claude, .codex/ exists → codex
 * 3. Default: claude
 */
export async function detectProvider(projectRoot: string): Promise<ProviderInfo> {
  const envProvider = process.env['SPECRAILS_CLI_PROVIDER'];
  if (envProvider === 'claude' || envProvider === 'codex') {
    return { provider: envProvider, configDir: configDirForProvider(envProvider) };
  }

  const claudeExists = await dirExists(resolve(projectRoot, '.claude'));
  if (claudeExists) {
    return { provider: 'claude', configDir: '.claude' };
  }

  const codexExists = await dirExists(resolve(projectRoot, '.codex'));
  if (codexExists) {
    return { provider: 'codex', configDir: '.codex' };
  }

  return { provider: 'claude', configDir: '.claude' };
}

/**
 * Returns the instructions filename for the given provider.
 * Claude Code uses CLAUDE.md, Codex uses CODEX.md.
 */
export function instructionsFileName(provider: CliProvider): string {
  return provider === 'codex' ? 'CODEX.md' : 'CLAUDE.md';
}
