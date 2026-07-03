const jsonHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export class ElectroscopeMcpClient {
  constructor({ baseUrl, bearerToken, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.bearerToken = bearerToken;
    this.fetchImpl = fetchImpl;
    this.requestId = 0;
  }

  async manifest() {
    const response = await this.fetchImpl(`${this.baseUrl}/api/mcp`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });
    if (!response.ok) {
      throw new Error(`MCP manifest failed (${response.status})`);
    }
    return response.json();
  }

  async call(method, params = {}) {
    this.requestId += 1;
    const response = await this.fetchImpl(`${this.baseUrl}/api/mcp`, {
      method: 'POST',
      headers: jsonHeaders(this.bearerToken),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.requestId,
        method,
        params,
      }),
    });

    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload?.error?.message ?? `MCP request failed (${response.status})`);
    }
    return payload.result;
  }

  async listTools() {
    return this.call('tools/list', {});
  }

  async callTool(name, args = {}) {
    return this.call('tools/call', { name, arguments: args });
  }
}
