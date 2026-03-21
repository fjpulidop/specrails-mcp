import { describe, it, expect } from 'vitest';
import { createServer, SERVER_NAME, SERVER_VERSION } from '../src/server.js';

describe('createServer', () => {
  it('returns an MCP server instance', () => {
    const server = createServer('/tmp/test-specrails-project');
    expect(server).toBeDefined();
  });

  it('exports correct server name', () => {
    expect(SERVER_NAME).toBe('specrails-mcp');
  });

  it('exports correct server version', () => {
    expect(SERVER_VERSION).toBe('0.1.0');
  });
});
