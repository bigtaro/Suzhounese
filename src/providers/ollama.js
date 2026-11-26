import {
  ProviderError,
  errorDetail,
  extractLanguage,
  extractTranscription,
} from './shared.js';

function transcriptionEndpoint(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/audio/transcriptions')) return base;
  if (base.endsWith('/v1')) return `${base}/audio/transcriptions`;
  return `${base}/v1/audio/transcriptions`;
}

export class OllamaAsrProvider {
  constructor({
    baseUrl,
    model,
    apiKey = '',
    timeoutMs = 300_000,
    fetchImpl = globalThis.fetch,
  }) {
    this.id = 'ollama';
    this.label = '本地 Ollama';
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return true;
  }

  endpoint() {
    return transcriptionEndpoint(this.baseUrl);
  }

  buildForm({ audio, mimeType, filename = 'audio.wav' }) {
    const form = new FormData();
    const uploadName = /\.[a-z0-9]+$/i.test(filename) ? filename : 'audio.wav';
    form.append('file', new Blob([audio], { type: mimeType }), uploadName);
    form.append('model', this.model);
    form.append('response_format', 'json');
    return form;
  }

  async transcribe({ audio, mimeType, filename, signal }) {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    const headers = {};
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    let response;
    try {
      response = await this.fetchImpl(this.endpoint(), {
        method: 'POST',
        headers,
        body: this.buildForm({ audio, mimeType, filename }),
        signal: requestSignal,
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new ProviderError('本地 Ollama 请求超时或已取消', 504, 'timeout');
      }
      throw new ProviderError(
        `无法连接本地 Ollama (${this.endpoint()})：${error.message}`,
        502,
      );
    }

    const raw = await response.text();
    let body = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      throw new ProviderError(
        `本地 Ollama 请求失败 (HTTP ${response.status})：${errorDetail(
          body,
          raw.slice(0, 400),
        )}`,
        502,
      );
    }

    if (typeof body === 'string') {
      return { text: body.trim(), language: null };
    }
    if (!body || typeof body !== 'object') {
      const text = raw.trim();
      if (!text) {
        throw new ProviderError('本地 Ollama 返回中没有转写文本', 502, 'empty_result');
      }
      return { text, language: null };
    }

    return {
      text: extractTranscription(body),
      language: extractLanguage(body),
    };
  }
}
