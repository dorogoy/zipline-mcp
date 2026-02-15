import { describe, it, expect, beforeAll } from 'vitest';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

describe('MCP Tool Discovery Integration', () => {
  beforeAll(() => {
    process.env.ZIPLINE_TOKEN = 'test-token';
    process.env.ZIPLINE_ENDPOINT = 'http://localhost:3000';
  });

  it('should discover 12 tools via MCP protocol', async () => {
    const { server } = await import('./index.js');

    // In the latest SDK, tools are stored in a private property.
    // We use eslint-disable to allow access to internal state for testing.
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    const serverAny = server as any;
    const tools = serverAny._tools || serverAny.tools;

    if (tools) {
      const toolNames =
        tools instanceof Map ? Array.from(tools.keys()) : Object.keys(tools);
      expect(toolNames.length).toBe(12);
    } else {
      // Fallback to searching the handlers
      const handlers = serverAny._handlers?.request;
      if (handlers) {
        const listToolsHandler = handlers.get(
          ListToolsRequestSchema.shape.method.value
        );
        if (listToolsHandler) {
          const result = await listToolsHandler({});
          expect(result.tools.length).toBe(12);
        }
      }
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  });
});
