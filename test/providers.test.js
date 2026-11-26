import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.js';
import { createProviders } from '../src/providers/index.js';

test('createProviders keeps DashScope as default and adds local Ollama', () => {
  const config = readConfig({ QWEN_ASR_API_KEY: 'cloud-key' });
  const providers = createProviders(config);

  assert.deepEqual(
    providers.map((provider) => provider.id),
    ['dashscope', 'ollama'],
  );
  assert.equal(providers[0].model, 'qwen3-asr-flash');
  assert.equal(providers[1].model, 'frozenlab/qwen3-asr:latest');
  assert.equal(providers[1].isConfigured(), true);
});

test('createProviders honors Ollama as the default provider', () => {
  const config = readConfig({ QWEN_ASR_PROVIDER: 'ollama' });
  const providers = createProviders(config);

  assert.deepEqual(
    providers.map((provider) => provider.id),
    ['ollama', 'dashscope'],
  );
});

test('createProviders keeps mock mode isolated', () => {
  const config = readConfig({ QWEN_ASR_PROVIDER: 'mock' });
  const providers = createProviders(config);

  assert.deepEqual(
    providers.map((provider) => provider.id),
    ['mock'],
  );
});
