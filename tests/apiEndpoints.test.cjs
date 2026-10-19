const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../apiEndpoints.js'), 'utf8');
const api = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const cases = [
  ['new base URL', { baseUrl: 'https://relay.example/v1' }, 'https://relay.example/v1/chat/completions'],
  ['trailing slash and whitespace', { baseUrl: ' https://relay.example/v1/// ', apiPath: ' chat/completions ' }, 'https://relay.example/v1/chat/completions'],
  ['full URL pasted into base', { baseUrl: 'https://relay.example/v1/chat/completions' }, 'https://relay.example/v1/chat/completions'],
  ['full URL with trailing slash', { baseUrl: 'https://relay.example/v1/chat/completions/' }, 'https://relay.example/v1/chat/completions'],
  ['legacy complete URL', { endpoint: 'https://relay.example/v1/chat/completions' }, 'https://relay.example/v1/chat/completions'],
  ['legacy trailing slash', { endpoint: 'https://relay.example/v1/chat/completions/' }, 'https://relay.example/v1/chat/completions/'],
  ['legacy base URL', { endpoint: 'https://relay.example/proxy/v1/' }, 'https://relay.example/proxy/v1/chat/completions'],
  ['legacy custom URL', { endpoint: 'https://relay.example/proxy/custom-invoke?version=1' }, 'https://relay.example/proxy/custom-invoke?version=1'],
  ['legacy custom route beneath completion prefix', { endpoint: 'https://relay.example/chat/completions/custom' }, 'https://relay.example/chat/completions/custom'],
  ['legacy repeated custom path', { endpoint: 'https://relay.example/custom/custom' }, 'https://relay.example/custom/custom'],
  ['legacy responses path unchanged (no protocol conversion)', { endpoint: 'https://relay.example/v1/responses' }, 'https://relay.example/v1/responses'],
  ['legacy messages path unchanged', { endpoint: 'https://relay.example/v1/messages' }, 'https://relay.example/v1/messages'],
  ['legacy root URL', { endpoint: 'http://localhost:4000/' }, 'http://localhost:4000/chat/completions'],
  ['custom route', { baseUrl: 'https://relay.example/proxy', apiPath: '/custom/invoke' }, 'https://relay.example/proxy/custom/invoke'],
  ['custom route pasted into base', { baseUrl: 'https://relay.example/proxy/custom/invoke', apiPath: '/custom/invoke' }, 'https://relay.example/proxy/custom/invoke'],
  ['cleared path uses default on save', { baseUrl: 'https://relay.example/v1', apiPath: '' }, 'https://relay.example/v1/chat/completions'],
  ['root API route', { baseUrl: 'https://relay.example/custom', apiPath: '/' }, 'https://relay.example/custom/'],
  ['legacy custom trailing slash', { endpoint: 'https://relay.example/custom/' }, 'https://relay.example/custom/'],
  ['blank URL stays blank', { baseUrl: '', endpoint: 'https://old.example/v1/chat/completions' }, ''],
  ['undefined profile', undefined, ''],
  ['base query retained', { baseUrl: 'https://relay.example/v1?tenant=demo' }, 'https://relay.example/v1/chat/completions?tenant=demo'],
  ['legacy query retained', { endpoint: 'https://relay.example/v1/chat/completions?tenant=demo#anchor' }, 'https://relay.example/v1/chat/completions?tenant=demo#anchor'],
  ['path query retained', { baseUrl: 'https://relay.example/v1?tenant=demo', apiPath: '/chat/completions?version=1' }, 'https://relay.example/v1/chat/completions?tenant=demo&version=1'],
  ['split fields take precedence over stale endpoint', { baseUrl: 'https://new.example/v1', apiPath: '/chat/completions', endpoint: 'https://old.example/v1/chat/completions' }, 'https://new.example/v1/chat/completions'],
];
for (const [name, profile, expected] of cases) {
  test(name, async () => {
    const { getApiEndpoint, normalizeApiProfile } = await api;
    const before = profile && JSON.stringify(profile);
    assert.equal(getApiEndpoint(profile), expected);
    const saved = normalizeApiProfile(profile);
    assert.equal(saved.endpoint, expected);
    assert.equal(getApiEndpoint(JSON.parse(JSON.stringify(saved))), expected);
    assert.deepEqual(normalizeApiProfile(saved), saved);
    assert.equal(profile && JSON.stringify(profile), before);
  });
}

test('migration retains key, model aliases, and other profile settings', async () => {
  const { normalizeApiProfile } = await api;
  const profile = { id: 'a', name: '站子', apiKey: 'fake-test-key', model: 'model-a', models: [{ id: 'model-a', displayName: '昵称' }], supportsVision: true, endpoint: 'https://relay.example/v1/chat/completions' };
  const migrated = normalizeApiProfile(profile);
  assert.deepEqual(migrated, { ...profile, baseUrl: 'https://relay.example/v1', apiPath: '/chat/completions' });
});

test('model listing uses base URL, not the completion or custom route', async () => {
  const { getModelsEndpoint } = await api;
  assert.equal(getModelsEndpoint({ baseUrl: 'https://relay.example/v1/', apiPath: '/custom/invoke' }), 'https://relay.example/v1/models');
  assert.equal(getModelsEndpoint({ baseUrl: 'https://relay.example/v1/chat/completions' }), 'https://relay.example/v1/models');
  assert.equal(getModelsEndpoint({ endpoint: 'https://relay.example/v1/chat/completions?tenant=demo' }), 'https://relay.example/v1/models?tenant=demo');
  assert.equal(getModelsEndpoint({ baseUrl: '' }), '');
});

