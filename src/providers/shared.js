export class ProviderError extends Error {
  constructor(message, statusCode = 502, code = 'provider_error') {
    super(message);
    this.name = 'ProviderError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text ?? part?.transcription ?? part?.content ?? '';
      })
      .join('');
  }
  if (content && typeof content === 'object') {
    return content.text ?? content.transcription ?? content.content ?? '';
  }
  return '';
}

export function extractTranscription(payload) {
  const message = payload?.choices?.[0]?.message;
  const candidates = [
    contentToText(message?.content),
    contentToText(payload?.content),
    payload?.text,
    payload?.output?.text,
    payload?.choices?.[0]?.text,
  ];

  const text = candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim(),
  );
  if (!text) {
    throw new ProviderError('ASR 返回中没有转写文本', 502, 'empty_result');
  }
  return text.trim();
}

export function extractLanguage(payload) {
  const direct =
    payload?.language ?? payload?.output?.language ?? payload?.choices?.[0]?.language;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const annotations = payload?.choices?.[0]?.message?.annotations;
  if (Array.isArray(annotations)) {
    const language = annotations.find((item) => item?.language)?.language;
    if (typeof language === 'string' && language.trim()) return language.trim();
  }
  return null;
}

export function errorDetail(body, fallback) {
  const raw =
    body?.error?.message || body?.message || body?.error || fallback || '未知错误';
  const message = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const requestId = body?.request_id ? ` (request_id: ${body.request_id})` : '';
  return `${message.slice(0, 400)}${requestId}`;
}
