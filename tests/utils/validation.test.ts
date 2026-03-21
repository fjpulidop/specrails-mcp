import { describe, it, expect } from 'vitest';
import {
  requireNonEmptyString,
  requireString,
  requireBoolean,
  requireSafeFilename,
} from '../../src/utils/validation.js';

describe('requireNonEmptyString', () => {
  it('returns trimmed value for valid string', () => {
    expect(requireNonEmptyString('  hello  ', 'field')).toBe('hello');
  });

  it('throws for empty string', () => {
    expect(() => requireNonEmptyString('', 'field')).toThrow('"field" must be a non-empty string');
  });

  it('throws for whitespace-only string', () => {
    expect(() => requireNonEmptyString('   ', 'field')).toThrow(
      '"field" must be a non-empty string',
    );
  });

  it('throws for non-string', () => {
    expect(() => requireNonEmptyString(42, 'field')).toThrow('"field" must be a non-empty string');
  });
});

describe('requireString', () => {
  it('returns empty string', () => {
    expect(requireString('', 'field')).toBe('');
  });

  it('throws for non-string', () => {
    expect(() => requireString(null, 'field')).toThrow('"field" must be a string');
  });
});

describe('requireBoolean', () => {
  it('returns true', () => {
    expect(requireBoolean(true, 'field')).toBe(true);
  });

  it('returns false', () => {
    expect(requireBoolean(false, 'field')).toBe(false);
  });

  it('throws for non-boolean', () => {
    expect(() => requireBoolean('true', 'field')).toThrow('"field" must be a boolean');
  });
});

describe('requireSafeFilename', () => {
  it('returns valid filename', () => {
    expect(requireSafeFilename('my-spec.yaml', 'name')).toBe('my-spec.yaml');
  });

  it('throws for path with forward slash', () => {
    expect(() => requireSafeFilename('sub/dir.yaml', 'name')).toThrow(
      '"name" must not contain path separators',
    );
  });

  it('throws for path with backslash', () => {
    expect(() => requireSafeFilename('sub\\dir.yaml', 'name')).toThrow(
      '"name" must not contain path separators',
    );
  });
});
