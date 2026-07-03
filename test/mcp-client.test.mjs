import test from 'node:test';
import assert from 'node:assert/strict';
import { ElectroscopeMcpClient } from '../src/lib/mcp-client.mjs';

test('callTool sends JSON-RPC payloads to the Electroscope MCP endpoint', async () => {
  const requests = [];
  const client = new ElectroscopeMcpClient({
    baseUrl: 'http://localhost:3003',
    bearerToken: 'token-1',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        async json() {
          return {
            jsonrpc: '2.0',
            id: 1,
            result: {
              structuredContent: { total: 1 },
            },
          };
        },
      };
    },
  });

  const result = await client.callTool('search_people', { query: 'Taylor', scope: 'tenant' });

  assert.deepEqual(result, { structuredContent: { total: 1 } });
  assert.equal(requests[0].url, 'http://localhost:3003/api/mcp');
  assert.equal(requests[0].init.method, 'POST');
  assert.match(String(requests[0].init.body), /"method":"tools\/call"/);
  assert.match(String(requests[0].init.body), /"name":"search_people"/);
});
