import {
  ProviderError,
  errorDetail,
  extractLanguage,
  extractTranscription,
} from './shared.js';

export { ProviderError, extractLanguage, extractTranscription };

export class QwenAsrProvider {
  constructor({
    apiKey,
    baseUrl,
    model,
    timeoutMs = 120_000,
    provider = 'dashscope',
    enableItn = false,
    fetchImpl = globalThis.fetch,
  }) {
    this.id = provider;
    this.label = provider === 'dashscope' ? '阿里云 DashScope' : 'OpenAI-compatible';
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.enableItn = enableItn;
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  endpoint() {
    return this.baseUrl.endsWith('/chat/completions')
      ? this.baseUrl
      : `${this.baseUrl}/chat/completions`;
  }

  buildPayload({ audio, mimeType }) {
    const payload = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: {
                data: `data:${mimeType};base64,${audio.toString('base64')}`,
              },
            },
          ],
        },
      ],
      stream: false,
    };

    if (this.id === 'dashscope') {
      payload.asr_options = {
        enable_lid: true,
        enable_itn: this.enableItn,
      };
    }
    return payload;
  }

  async transcribe({ audio, mimeType, signal }) {
    if (!this.isConfigured()) {
      throw new ProviderError(
        '未配置 QWEN_ASR_API_KEY，请先填写 .env 后重启服务',
        503,
        'not_configured',
      );
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    let response;
    try {
      response = await this.fetchImpl(this.endpoint(), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(this.buildPayload({ audio, mimeType })),
        signal: requestSignal,
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new ProviderError('Qwen3-ASR 请求超时或已取消', 504, 'timeout');
      }
      throw new ProviderError(`无法连接 Qwen3-ASR：${error.message}`, 502);
    }

    const raw = await response.text();
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { message: raw.slice(0, 400) };
    }

    if (!response.ok) {
      throw new ProviderError(
        `Qwen3-ASR 请求失败 (HTTP ${response.status})：${errorDetail(body)}`,
        502,
      );
    }

    return {
      text: extractTranscription(body),
      language: extractLanguage(body),
    };
  }
}
