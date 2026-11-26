import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigError, readConfig } from '../src/config.js';

test('readConfig provides Qwen3-ASR defaults', () => {
  const config = readConfig({});

  assert.equal(config.provider, 'dashscope');
  assert.equal(config.model, 'qwen3-asr-flash');
  assert.equal(config.maxDurationSec, 300);
  assert.equal(config.enableItn, false);
  assert.equal(config.apiKey, '');
  assert.equal(config.ollamaBaseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(config.ollamaModel, 'frozenlab/qwen3-asr:latest');
  assert.equal(config.ollamaTimeoutMs, 300000);
});

test('readConfig parses overrides', () => {
  const config = readConfig({
    HOST: '0.0.0.0',
    PORT: '9000',
    QWEN_ASR_PROVIDER: 'openai-compatible',
    QWEN_ASR_API_KEY: ' secret ',
    QWEN_ASR_BASE_URL: 'http://localhost:8000/v1/',
    QWEN_ASR_MODEL: 'Qwen/Qwen3-ASR-1.7B',
    QWEN_ASR_MAX_DURATION_SEC: '180',
    QWEN_ASR_ENABLE_ITN: 'true',
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 9000);
  assert.equal(config.provider, 'openai-compatible');
  assert.equal(config.apiKey, 'secret');
  assert.equal(config.baseUrl, 'http://localhost:8000/v1');
  assert.equal(config.model, 'Qwen/Qwen3-ASR-1.7B');
  assert.equal(config.maxDurationSec, 180);
  assert.equal(config.enableItn, true);
});

test('readConfig parses local Ollama overrides', () => {
  const config = readConfig({
    QWEN_ASR_PROVIDER: 'ollama',
    QWEN_ASR_OLLAMA_BASE_URL: 'http://127.0.0.1:11435/',
    QWEN_ASR_OLLAMA_MODEL: 'frozenlab/qwen3-asr:latest',
    QWEN_ASR_OLLAMA_API_KEY: ' local-secret ',
    QWEN_ASR_OLLAMA_TIMEOUT_MS: '600000',
  });

  assert.equal(config.provider, 'ollama');
  assert.equal(config.ollamaBaseUrl, 'http://127.0.0.1:11435');
  assert.equal(config.ollamaModel, 'frozenlab/qwen3-asr:latest');
  assert.equal(config.ollamaApiKey, 'local-secret');
  assert.equal(config.ollamaTimeoutMs, 600000);
});

test('readConfig rejects unknown providers', () => {
  assert.throws(
    () => readConfig({ QWEN_ASR_PROVIDER: 'local-magic' }),
    ConfigError,
  );
});

test('readConfig rejects malformed numeric values', () => {
  assert.throws(() => readConfig({ PORT: 'abc' }), /PORT 必须是/);
  assert.throws(() => readConfig({ QWEN_ASR_MAX_DURATION_SEC: '0' }), /必须是/);
});
