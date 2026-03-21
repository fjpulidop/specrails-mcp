import { resolve, relative, normalize } from 'path';

/**
 * Resolves a path safely within a root directory.
 * Throws if the resolved path escapes the root (path traversal prevention).
 */
export function safeResolve(root: string, ...segments: string[]): string {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(resolvedRoot, ...segments);
  const rel = relative(resolvedRoot, resolvedTarget);

  if (rel.startsWith('..') || normalize(rel) === '..') {
    throw new Error(`Path traversal detected: "${segments.join('/')}" escapes root "${root}"`);
  }

  return resolvedTarget;
}

/**
 * Returns true if the given path is safely within the root directory.
 */
export function isWithinRoot(root: string, target: string): boolean {
  try {
    safeResolve(root, target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the specrails project root from SPECRAILS_PROJECT_ROOT env var
 * or defaults to the current working directory.
 */
export function getProjectRoot(): string {
  return process.env['SPECRAILS_PROJECT_ROOT'] ?? process.cwd();
}
