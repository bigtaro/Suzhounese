import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createRequestHandler } from '../src/server.js';

async function request(
  service,
  { services, method = 'GET', url = '/', headers = {}, body } = {},
) {
  const config = { maxAudioMb: 1, maxDurationSec: 10 };
  const handler = createRequestHandler({
    config,
    service: services ? undefined : service,
    services,
  });
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  req.method = method;
  req.url = url;
  req.headers = headers;

  const res = new EventEmitter();
  res.headersSent = false;
  res.writeHead = (statusCode, responseHeaders) => {
    res.statusCode = statusCode;
    res.responseHeaders = responseHeaders;
    res.headersSent = true;
  };
  res.end = (chunk) => {
    res.body = chunk ? Buffer.from(chunk) : Buffer.alloc(0);
    res.emit('close');
    res.emit('finish');
  };

  await handler(req, res);
  return {
    status: res.statusCode,
    headers: res.responseHeaders,
    text: () => Promise.resolve(res.body.toString('utf8')),
    json: () => Promise.resolve(JSON.parse(res.body.toString('utf8'))),
  };
}

function fakeService(overrides = {}) {
  return {
    provider: {
      id: 'dashscope',
      label: '阿里云 DashScope',
      model: 'qwen3-asr-flash',
      isConfigured: () => true,
    },
    async transcribe({ buffer, filename }) {
      assert.equal(buffer.toString(), 'audio-bytes');
      assert.equal(filename, 'sample.wav');
      return {
        text: '侬好',
        language: 'Chinese',
        durationSec: 1.5,
        provider: 'dashscope',
        model: 'qwen3-asr-flash',
        elapsedMs: 120,
      };
    },
    ...overrides,
  };
}

test('GET /api/health reports provider state and limits', async () => {
  const response = await request(fakeService(), { url: '/api/health' });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.configured, true);
  assert.equal(body.model, 'qwen3-asr-flash');
  assert.deepEqual(body.providers, [
    {
      id: 'dashscope',
      label: '阿里云 DashScope',
      model: 'qwen3-asr-flash',
      configured: true,
    },
  ]);
  assert.deepEqual(body.limits, { maxAudioMb: 1, maxDurationSec: 10 });
});

test('POST /api/transcribe forwards raw audio to the service', async () => {
  const response = await request(fakeService(), {
    method: 'POST',
    url: '/api/transcribe?filename=sample.wav',
    headers: { 'content-type': 'audio/wav' },
    body: 'audio-bytes',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.text, '侬好');
  assert.equal(body.durationSec, 1.5);
});

test('POST /api/transcribe rejects unsupported content types', async () => {
  const response = await request(fakeService(), {
    method: 'POST',
    url: '/api/transcribe',
    headers: { 'content-type': 'text/plain' },
    body: 'hello',
  });
  const body = await response.json();

  assert.equal(response.status, 415);
  assert.equal(body.code, 'unsupported_media_type');
});

test('POST /api/transcribe selects the requested provider', async () => {
  const services = new Map([
    ['dashscope', fakeService()],
    [
      'ollama',
      fakeService({
        provider: {
          id: 'ollama',
          label: '本地 Ollama',
          model: 'frozenlab/qwen3-asr:latest',
          isConfigured: () => true,
        },
        async transcribe() {
          return {
            text: '本地结果',
            language: 'Chinese',
            durationSec: 1.5,
            provider: 'ollama',
            model: 'frozenlab/qwen3-asr:latest',
            elapsedMs: 220,
          };
        },
      }),
    ],
  ]);

  const response = await request(undefined, {
    services,
    method: 'POST',
    url: '/api/transcribe?filename=sample.wav&provider=ollama',
    headers: { 'content-type': 'audio/wav' },
    body: 'audio-bytes',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.text, '本地结果');
  assert.equal(body.provider, 'ollama');
});

test('POST /api/transcribe rejects unknown providers', async () => {
  const response = await request(fakeService(), {
    method: 'POST',
    url: '/api/transcribe?provider=missing',
    headers: { 'content-type': 'audio/wav' },
    body: 'audio-bytes',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, 'unknown_provider');
});

test('static app is served with security headers', async () => {
  const response = await request(fakeService(), { url: '/' });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.headers['content-security-policy'], /default-src 'self'/);
  assert.match(html, /Qwen3-ASR/);
});
