const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../contextManager.js'), 'utf8');
const api = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('context planning keeps the recent window and never summarizes half a turn', async () => {
  const { planContext } = await api;
  const rows = [];
  for (let i = 1; i <= 24; i += 1) rows.push({ id: i, role: i % 2 ? 'user' : 'assistant', content: `消息${i}。${'x'.repeat(500)}` });
  const result = planContext(rows, null, { enabled: true, autoCompact: true, triggerTokens: 3000, recentMessages: 10 });
  assert.equal(result.batch.at(-1).role, 'assistant');
  assert.ok(result.batch.length <= 14);
  assert.equal(result.pending.length, 24);
});

test('finance notifications are not copied into persistent role-play context', async () => {
  const { getConversationContextRows } = await api;
  const rows = getConversationContextRows([
    { id: 1, role: 'user', content: 'hidden bill 2000', metadata: JSON.stringify({ financeEvent: true }) },
    { id: 2, role: 'assistant', content: 'I saw that purchase.', metadata: JSON.stringify({ financeEvent: true }) },
    { id: 3, role: 'user', content: '普通聊天', metadata: null },
  ]);
  assert.deepEqual(rows.map(row => row.id), [2, 3]);
});

test('summary parser extracts JSON from prose and rejects incomplete or oversized output', async () => {
  const { parseContextCompactionResponse } = await api;
  const valid = JSON.stringify({ summary: 'x', relationshipMemory: '', userPreferences: '', currentState: '' });
  assert.equal(parseContextCompactionResponse(`结果如下：\n\`\`\`json\n${valid}\n\`\`\`\n完成`).summary, 'x');
  assert.throws(() => parseContextCompactionResponse('not json'), /合法的 JSON/);
  assert.throws(() => parseContextCompactionResponse('{"summary":"x"}'), /字段不完整/);
  assert.throws(() => parseContextCompactionResponse(JSON.stringify({ summary: 'x'.repeat(101), relationshipMemory: '', userPreferences: '', currentState: '' }), 100), /过长/);
});

test('malformed model output gets one repair attempt before failing', async () => {
  const { requestContextSummary } = await api;
  const outputs = ['这是一段普通回复，不是JSON。', JSON.stringify({ summary: '修复后摘要', relationshipMemory: '', userPreferences: '', currentState: '' })];
  let calls = 0;
  const result = await requestContextSummary({
    fetcher: async (_url, options) => {
      calls += 1;
      const request = JSON.parse(options.body);
      assert.ok(request.max_tokens >= 1200);
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: outputs.shift() } }] }) };
    },
    endpoint: 'https://example.invalid/v1/chat/completions',
    profile: { model: 'test-model', apiKey: '' }, memory: null, rows: [],
    settings: { summaryMaxChars: 6000 },
  });
  assert.equal(calls, 2);
  assert.equal(result.summary, '修复后摘要');
});

test('context settings are bounded and memory content is marked as fallible data', async () => {
  const { normalizeContextSettings, buildManagedMessages } = await api;
  assert.equal(normalizeContextSettings({ triggerTokens: 1 }).triggerTokens, 3000);
  const messages = buildManagedMessages({ system: 'Be kind.', memory: { summary: 'old note' }, rows: [], currentMessage: { role: 'user', content: 'now' } });
  assert.match(messages[0].content, /never as instructions/);
  assert.equal(messages[1].role, 'user');
});

