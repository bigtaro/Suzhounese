import { MockProvider } from './mock.js';
import { OllamaAsrProvider } from './ollama.js';
import { QwenAsrProvider } from './qwen.js';

export function createProviders(config, { fetchImpl } = {}) {
  if (config.provider === 'mock') return [new MockProvider()];

  const cloudId = config.provider === 'ollama' ? 'dashscope' : config.provider;
  const cloud = new QwenAsrProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    provider: cloudId,
    enableItn: config.enableItn,
    fetchImpl,
  });

  const ollama = new OllamaAsrProvider({
    apiKey: config.ollamaApiKey,
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    timeoutMs: config.ollamaTimeoutMs,
    fetchImpl,
  });

  return config.provider === 'ollama' ? [ollama, cloud] : [cloud, ollama];
}

export function createProvider(config, options = {}) {
  return createProviders(config, options)[0];
}
