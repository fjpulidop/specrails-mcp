/**
 * Validates that a value is a non-empty string.
 */
export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Field "${field}" must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Validates that a value is a string (possibly empty).
 */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Field "${field}" must be a string`);
  }
  return value;
}

/**
 * Validates that a value is a boolean.
 */
export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Field "${field}" must be a boolean`);
  }
  return value;
}

/**
 * Validates that a string matches a safe file-name pattern (no path separators).
 */
export function requireSafeFilename(value: unknown, field: string): string {
  const str = requireNonEmptyString(value, field);
  if (/[/\\]/.test(str)) {
    throw new Error(`Field "${field}" must not contain path separators`);
  }
  return str;
}
