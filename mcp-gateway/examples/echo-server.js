let buffer = '';

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function handle(request) {
  if (request.method === 'notifications/initialized') return;
  if (request.method === 'initialize') {
    return send(request.id, {
      protocolVersion: request.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'echo-mcp', version: '0.1.0' },
    });
  }
  if (request.method === 'tools/list') {
    return send(request.id, {
      tools: [{
        name: 'echo',
        description: '返回输入内容',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      }],
    });
  }
  if (request.method === 'tools/call') {
    return send(request.id, {
      content: [{ type: 'text', text: String(request.params?.arguments?.text || '') }],
      isError: false,
    });
  }
  if (request.id !== undefined) send(request.id, {});
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try { handle(JSON.parse(line)); }
    catch (error) { process.stderr.write(`echo-mcp: ${error.message}\n`); }
  }
});

