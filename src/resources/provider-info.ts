import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { detectProvider } from '../utils/provider.js';

/**
 * Registers a static MCP resource that exposes the active CLI provider info.
 * URI: specrails://provider
 *
 * Returns a JSON object with:
 * - provider: "claude" | "codex"
 * - configDir: ".claude" | ".codex"
 */
export function registerProviderInfoResource(server: McpServer, projectRoot: string): void {
  server.resource(
    'provider-info',
    'specrails://provider',
    {
      mimeType: 'application/json',
      description:
        'Active CLI provider info (claude or codex) and the corresponding config directory',
    },
    async (resourceUri) => {
      const info = await detectProvider(projectRoot);

      return {
        contents: [
          {
            uri: resourceUri.toString(),
            text: JSON.stringify(info, null, 2),
            mimeType: 'application/json',
          },
        ],
      };
    },
  );
}
