import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeResolve, isWithinRoot, getProjectRoot } from '../../src/utils/paths.js';
import { resolve } from 'path';

const ROOT = '/tmp/test-root';

describe('safeResolve', () => {
  it('resolves a valid nested path', () => {
    const result = safeResolve(ROOT, 'subdir', 'file.txt');
    expect(result).toBe(resolve(ROOT, 'subdir', 'file.txt'));
  });

  it('resolves a file directly in root', () => {
    const result = safeResolve(ROOT, 'file.txt');
    expect(result).toBe(resolve(ROOT, 'file.txt'));
  });

  it('throws on path traversal with ..', () => {
    expect(() => safeResolve(ROOT, '../etc/passwd')).toThrow('Path traversal detected');
  });

  it('throws on deep traversal', () => {
    expect(() => safeResolve(ROOT, 'a/b/../../..', 'secret')).toThrow('Path traversal detected');
  });
});

describe('isWithinRoot', () => {
  it('returns true for valid paths', () => {
    expect(isWithinRoot(ROOT, 'safe/path.txt')).toBe(true);
  });

  it('returns false for traversal attempts', () => {
    expect(isWithinRoot(ROOT, '../outside')).toBe(false);
  });
});

describe('getProjectRoot', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns SPECRAILS_PROJECT_ROOT when set', () => {
    vi.stubEnv('SPECRAILS_PROJECT_ROOT', '/custom/root');
    expect(getProjectRoot()).toBe('/custom/root');
  });

  it('returns process.cwd() when env var is undefined', () => {
    delete process.env['SPECRAILS_PROJECT_ROOT'];
    expect(getProjectRoot()).toBe(process.cwd());
  });
});
