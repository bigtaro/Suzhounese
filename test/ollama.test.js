import assert from 'node:assert/strict';
import test from 'node:test';
import { OllamaAsrProvider } from '../src/providers/ollama.js';
import { ProviderError } from '../src/providers/shared.js';

function provider(fetchImpl, overrides = {}) {
  return new OllamaAsrProvider({
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'frozenlab/qwen3-asr:latest',
    fetchImpl,
    ...overrides,
  });
}

test('Ollama provider posts audio to the OpenAI transcription endpoint', async () => {
  let request;
  const asr = provider(async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ text: '侬好，苏州。' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const result = await asr.transcribe({
    audio: Buffer.from('abc'),
    mimeType: 'audio/wav',
    filename: 'sample.wav',
  });

  assert.equal(result.text, '侬好，苏州。');
  assert.equal(request.url, 'http://127.0.0.1:11434/v1/audio/transcriptions');
  assert.equal(request.options.headers.authorization, undefined);

  const form = request.options.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('model'), 'frozenlab/qwen3-asr:latest');
  assert.equal(form.get('response_format'), 'json');

  const file = form.get('file');
  assert.equal(file.name, 'sample.wav');
  assert.equal(file.type, 'audio/wav');
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), 'abc');
});

test('Ollama provider accepts a root base URL and optional API key', async () => {
  let request;
  const asr = provider(
    async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    },
    { baseUrl: 'http://127.0.0.1:11434', apiKey: 'local-key' },
  );

  await asr.transcribe({ audio: Buffer.from('x'), mimeType: 'audio/wav' });

  assert.equal(request.url, 'http://127.0.0.1:11434/v1/audio/transcriptions');
  assert.equal(request.options.headers.authorization, 'Bearer local-key');
});

test('Ollama provider reports server errors', async () => {
  const asr = provider(async () =>
    new Response(JSON.stringify({ error: 'model not found' }), {
      status: 404,
    }),
  );

  await assert.rejects(
    () => asr.transcribe({ audio: Buffer.from('x'), mimeType: 'audio/wav' }),
    (error) => {
      assert.ok(error instanceof ProviderError);
      assert.match(error.message, /HTTP 404/);
      assert.match(error.message, /model not found/);
      return true;
    },
  );
});
