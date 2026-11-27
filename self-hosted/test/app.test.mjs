import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../app.mjs';
import { localAssistant } from '../assistant.mjs';
import { isPublicIPv4 } from '../byok.mjs';
import { createServer } from 'node:http';

test('protects private data, blocks cross-origin writes, and revokes signed-out sessions', async () => {
  await withApp(':memory:', async ({ request, login }) => {
    assert.equal((await request('/api/entries')).status, 401);
    assert.equal((await request('/')).status, 200);
    assert.equal((await login('wrong-password')).status, 401);
    const signedIn = await login();
    assert.equal(signedIn.status, 204);
    const cookie = signedIn.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly; SameSite=Strict/);
    const headers = { Cookie: cookie.split(';')[0] };
    const crossOrigin = await request('/api/entries', {
      method: 'POST', headers: { ...headers, Origin: 'https://elsewhere.example' }, json: { title: 'A', text: 'B' },
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await request('/api/session', { method: 'DELETE', headers })).status, 204);
    assert.equal((await request('/api/entries', { headers })).status, 401);
  });
});

test('persists notes across process lifetimes and searches French text without accents', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'call-ai-test-'));
  const database = join(folder, 'test.sqlite');
  try {
    await withApp(database, async ({ request, owner }) => {
      const headers = await owner();
      const saved = await request('/api/entries', {
        method: 'POST', headers, json: { title: 'Rendez-vous', text: 'Expérience de réparation.' },
      });
      assert.equal(saved.status, 201);
    });
    await withApp(database, async ({ request, owner }) => {
      const headers = await owner();
      const [entry] = await (await request('/api/entries?q=reparation', { headers })).json();
      assert.equal(entry.title, 'Rendez-vous');
      const saved = await (await request(`/api/entries/${entry.id}`, { headers })).json();
      assert.match(saved.text, /réparation/);
      assert.equal((await request(`/api/entries/${entry.id}`, { method: 'DELETE', headers })).status, 204);
      assert.deepEqual(await (await request('/api/entries', { headers })).json(), []);
      const replacement = await request('/api/entries', {
        method: 'POST', headers, json: { title: 'Autre note', text: 'Un autre document.' },
      });
      assert.notEqual((await replacement.json()).id, entry.id);
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('accepts authenticated PDF text extraction and rejects non-PDF data', async () => {
  await withApp(':memory:', async ({ request, owner }) => {
    const headers = { ...await owner(), 'Content-Type': 'application/pdf' };
    assert.equal((await request('/api/pdfs?title=CV', { method: 'POST', headers, body: 'invalid' })).status, 400);
    const accepted = await request('/api/pdfs?title=CV', { method: 'POST', headers, body: '%PDF-1.7\nfixture' });
    assert.equal(accepted.status, 201);
    const [entry] = await (await request('/api/entries?q=mecanicien', { headers })).json();
    assert.equal(entry.kind, 'pdf');
    assert.equal(entry.title, 'CV');
  }, async () => 'Mécanicien automobile.');
});

test('uses local assistant adapters for chat and dictation, and persists the successful exchange', async () => {
  const context = [];
  const assistant = {
    async complete(messages) { context.push(...messages); return 'Jeudi à dix heures.'; },
    async transcribe(bytes, type) { assert.equal(bytes.toString(), 'test audio'); assert.equal(type, 'audio/webm'); return 'Rendez-vous garage'; },
  };
  await withApp(':memory:', async ({ request, owner }) => {
    assert.equal((await request('/api/assistant')).status, 401);
    const headers = await owner();
    const pdfNote = await request('/api/entries', { method: 'POST', headers,
      json: { title: 'Garage', text: 'Le rendez-vous est jeudi à dix heures.' } });
    assert.equal(pdfNote.status, 201);
    const transcript = await request('/api/assistant/audio', { method: 'POST',
      headers: { ...headers, 'Content-Type': 'audio/webm' }, body: 'test audio' });
    assert.deepEqual(await transcript.json(), { text: 'Rendez-vous garage' });
    assert.equal((await request('/api/assistant/preferences', { method: 'PUT', headers, json: { language: 'fr' } })).status, 204);
    const reply = await request('/api/assistant/chat', { method: 'POST', headers, json: { text: 'Rendez-vous garage ?' } });
    assert.equal(reply.status, 201);
    assert.equal((await reply.json()).reply.text, 'Jeudi à dix heures.');
    assert.match(context[0].content, /Le rendez-vous est jeudi/);
    assert.match(context[0].content, /Always reply in French/);
    assert.equal(context.at(-1).content, 'Rendez-vous garage ?');
    const state = await (await request('/api/assistant', { headers })).json();
    assert.deepEqual(state.messages.map(({ role }) => role), ['user', 'assistant']);
    assert.equal(state.language, 'fr');
  }, undefined, assistant);
});

test('sends the Ollama JSON and Whisper multipart formats to loopback only', async () => {
  const received = [];
  const service = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ path: request.url, type: request.headers['content-type'], body: Buffer.concat(chunks).toString() });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.url === '/api/chat' ? { message: { content: 'Bonjour' } } : { text: 'Bonjour à vous' }));
  });
  service.listen(0, '127.0.0.1');
  await once(service, 'listening');
  try {
    const origin = `http://127.0.0.1:${service.address().port}`;
    const assistant = localAssistant({ model: 'test-model', ollamaOrigin: origin, whisperOrigin: origin });
    const messages = [{ role: 'user', content: 'Bonjour' }];
    assert.equal(await assistant.complete(messages), 'Bonjour');
    assert.equal(await assistant.transcribe(Buffer.from('audio'), 'audio/webm'), 'Bonjour à vous');
    assert.equal(received[0].path, '/api/chat');
    assert.deepEqual(JSON.parse(received[0].body), { model: 'test-model', messages, stream: false });
    assert.equal(received[1].path, '/inference');
    assert.match(received[1].type, /^multipart\/form-data; boundary=/);
    assert.match(received[1].body, /name="file"; filename="dictation.webm"/);
    assert.match(received[1].body, /name="response_format"\r\n\r\njson/);
    assert.throws(() => localAssistant({ whisperOrigin: 'https://outside.example' }), /loopback/);
  } finally {
    await new Promise(resolve => service.close(resolve));
  }
});

test('owner can choose NVIDIA or a compatible endpoint without disclosing or moving a saved key', async () => {
  const requests = [];
  await withApp(':memory:', async ({ request, owner }) => {
    const route = '/api/assistant/provider';
    assert.equal((await request(route)).status, 401);
    const headers = await owner();
    const key = 'nvapi-test-only-fake-value';
    const save = (json) => request(route, { method: 'PUT', headers, json });
    assert.equal((await save({ provider: 'nvidia', model: 'nvidia/example', apiKey: key })).status, 204);
    const state = await (await request(route, { headers })).json();
    assert.equal(state.provider, 'nvidia');
    assert.equal(state.keyConfigured, true);
    assert.ok(!JSON.stringify(state).includes(key));
    assert.equal((await save({ provider: 'nvidia', model: 'nvidia/another' })).status, 204);
    assert.equal((await save({ provider: 'compatible', model: 'example', baseUrl: 'https://api.example.com/v1' })).status, 400);
    assert.equal((await save({ provider: 'compatible', model: 'example', baseUrl: 'https://127.0.0.1/v1', apiKey: key })).status, 400);
    const reply = await request('/api/assistant/chat', { method: 'POST', headers, json: { text: 'Bonjour' } });
    assert.equal(reply.status, 201);
    assert.equal((await reply.json()).reply.text, 'Bonsoir.');
    assert.equal(requests[0].url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(requests[0].apiKey, key);
    assert.equal(requests[0].body.model, 'nvidia/another');
    assert.equal((await save({ provider: 'compatible', model: 'example', baseUrl: 'https://api.example.com/v1/chat/completions', apiKey: 'user-owned-key' })).status, 204);
    assert.equal((await request(`${route}/test`, { method: 'POST', headers })).status, 200);
    assert.equal(requests[1].url, 'https://api.example.com/v1/chat/completions');
    assert.deepEqual(requests[1].body.messages, [{ role: 'user', content: 'Répondez simplement OK.' }]);
    assert.equal(requests[1].apiKey, 'user-owned-key');
    assert.equal((await request(route, { method: 'DELETE', headers })).status, 204);
    assert.equal((await request('/api/assistant/chat', { method: 'POST', headers, json: { text: 'Bonjour' } })).status, 503);
  }, undefined, undefined, async (url, apiKey, body) => {
    requests.push({ url: url.href, apiKey, body });
    return { choices: [{ message: { content: 'Bonsoir.' } }] };
  });
});

test('BYOK survives a restart as encrypted data and validates endpoint address ranges', async () => {
  for (const address of ['127.0.0.1', '10.0.0.25', '169.254.169.254', '192.168.1.1', '100.64.0.1', '::1']) {
    assert.equal(isPublicIPv4(address), false);
  }
  assert.equal(isPublicIPv4('8.8.8.8'), true);
  const folder = await mkdtemp(join(tmpdir(), 'call-ai-key-test-'));
  const database = join(folder, 'test.sqlite');
  const key = 'test-NVIDIA-ciphertext-must-not-contain-me';
  const route = '/api/assistant/provider';
  try {
    await withApp(database, async ({ request, owner }) => {
      const response = await request(route, { method: 'PUT', headers: await owner(), json: { provider: 'nvidia', model: 'nvidia/example', apiKey: key } });
      assert.equal(response.status, 204);
    });
    assert.equal((await readFile(database)).includes(Buffer.from(key)), false);
    await withApp(database, async ({ request, owner }) => {
      assert.equal((await request(`${route}/test`, { method: 'POST', headers: await owner() })).status, 200);
    }, undefined, undefined, async (url, credential) => {
      assert.equal(credential, key);
      return { choices: [{ message: { content: 'OK' } }] };
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

async function withApp(database, check, extractPdf, assistant, providerTransport) {
  const password = 'test-owner-password-for-local-run';
  const server = createApp({ password, database, extractPdf, assistant, providerTransport });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { headers, json, ...options } = {}) => fetch(origin + path, {
    ...options,
    headers: { Origin: origin, ...(json !== undefined && { 'Content-Type': 'application/json' }), ...headers },
    body: json !== undefined ? JSON.stringify(json) : options.body,
  });
  const login = (value = password) => request('/api/session', { method: 'POST', json: { password: value } });
  const owner = async () => ({ Cookie: (await login()).headers.get('set-cookie').split(';')[0] });
  try {
    await check({ request, login, owner });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
