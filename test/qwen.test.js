import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProviderError,
  QwenAsrProvider,
  extractTranscription,
} from '../src/providers/qwen.js';

function provider(fetchImpl, overrides = {}) {
  return new QwenAsrProvider({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/compatible-mode/v1',
    model: 'qwen3-asr-flash',
    fetchImpl,
    ...overrides,
  });
}

test('Qwen provider sends DashScope audio payload and parses text', async () => {
  let request;
  const asr = provider(async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: '侬好，苏州。' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });

  const result = await asr.transcribe({
    audio: Buffer.from('abc'),
    mimeType: 'audio/wav',
  });

  assert.equal(result.text, '侬好，苏州。');
  assert.equal(request.url, 'https://example.test/compatible-mode/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer test-key');

  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'qwen3-asr-flash');
  assert.equal(body.messages[0].content[0].type, 'input_audio');
  assert.equal(
    body.messages[0].content[0].input_audio.data,
    'data:audio/wav;base64,YWJj',
  );
  assert.deepEqual(body.asr_options, { enable_lid: true, enable_itn: false });
});

test('generic OpenAI-compatible provider does not send DashScope options', async () => {
  let body;
  const asr = provider(
    async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      );
    },
    { provider: 'openai-compatible' },
  );

  await asr.transcribe({ audio: Buffer.from('x'), mimeType: 'audio/wav' });
  assert.equal(body.asr_options, undefined);
});

test('Qwen provider surfaces API errors without leaking the key', async () => {
  const asr = provider(async () =>
    new Response(
      JSON.stringify({
        error: { message: 'invalid api key' },
        request_id: 'req-123',
      }),
      { status: 401 },
    ),
  );

  await assert.rejects(
    () => asr.transcribe({ audio: Buffer.from('x'), mimeType: 'audio/wav' }),
    (error) => {
      assert.ok(error instanceof ProviderError);
      assert.match(error.message, /HTTP 401/);
      assert.match(error.message, /invalid api key/);
      assert.match(error.message, /req-123/);
      assert.doesNotMatch(error.message, /test-key/);
      return true;
    },
  );
});

test('Qwen provider reports a missing API key', async () => {
  const asr = provider(async () => new Response('{}'), { apiKey: '' });
  await assert.rejects(
    () => asr.transcribe({ audio: Buffer.from('x'), mimeType: 'audio/wav' }),
    (error) => error.statusCode === 503 && error.code === 'not_configured',
  );
});

test('extractTranscription accepts structured content parts', () => {
  assert.equal(
    extractTranscription({
      choices: [
        {
          message: {
            content: [{ text: '第一段' }, { transcription: '第二段' }],
          },
        },
      ],
    }),
    '第一段第二段',
  );
});
