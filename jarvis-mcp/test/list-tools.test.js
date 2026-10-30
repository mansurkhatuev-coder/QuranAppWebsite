import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function textOf(result) {
  return (result.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

test('stdio server lists read-only tools and fails closed without secrets', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/index.js'],
    cwd: packageRoot,
    stderr: 'pipe',
    env: {
      PATH: process.env.PATH || '',
      WAYDEAN_MCP_SKIP_DOTENV: '1',
    },
  });
  const client = new Client({ name: 'waydean-jarvis-mcp-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ['get_analytics_summary', 'get_feedback_stats', 'list_academy_feedback']);
    for (const tool of listed.tools) {
      assert.equal(tool.annotations?.readOnlyHint, true);
    }

    const summary = await client.callTool({ name: 'get_analytics_summary', arguments: { days: 0 } });
    const summaryText = textOf(summary);
    assert.equal(summary.isError, true);
    assert.match(summaryText, /SUPABASE_URL/);
    assert.ok(summaryText.length < 300);

    const feedback = await client.callTool({
      name: 'list_academy_feedback',
      arguments: { limit: 20, min_rating: 4 },
    });
    assert.equal(feedback.isError, true);
    assert.ok(textOf(feedback).length < 300);

    const stats = await client.callTool({ name: 'get_feedback_stats', arguments: {} });
    assert.equal(stats.isError, true);
    assert.match(textOf(stats), /SUPABASE_URL/);
  } finally {
    await client.close();
  }
});
