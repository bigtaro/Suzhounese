import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROVIDERS = new Set(['dashscope', 'openai-compatible', 'ollama', 'mock']);

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadDotEnv(cwd = process.cwd()) {
  const candidates = [resolve(cwd, '.env'), resolve(cwd, 'src', '.env')];
  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
}

function integer(env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} 必须是 ${min} 到 ${max} 之间的整数`);
  }
  return value;
}

function boolean(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(raw.toLowerCase())) return false;
  throw new ConfigError(`${name} 必须是 true 或 false`);
}

export function readConfig(env = process.env) {
  const provider = (env.QWEN_ASR_PROVIDER || 'dashscope').trim().toLowerCase();
  if (!PROVIDERS.has(provider)) {
    throw new ConfigError(
      `QWEN_ASR_PROVIDER 必须是 ${[...PROVIDERS].join('、')} 之一`,
    );
  }

  const baseUrl = (
    env.QWEN_ASR_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1'
  ).replace(/\/+$/, '');

  const ollamaBaseUrl = (
    env.QWEN_ASR_OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1'
  ).replace(/\/+$/, '');

  try {
    new URL(baseUrl);
  } catch {
    throw new ConfigError('QWEN_ASR_BASE_URL 不是合法 URL');
  }

  try {
    new URL(ollamaBaseUrl);
  } catch {
    throw new ConfigError('QWEN_ASR_OLLAMA_BASE_URL 不是合法 URL');
  }

  return {
    host: env.HOST || '127.0.0.1',
    port: integer(env, 'PORT', 8787, { min: 0, max: 65535 }),
    provider,
    apiKey: env.QWEN_ASR_API_KEY?.trim() || '',
    baseUrl,
    model: (env.QWEN_ASR_MODEL || 'qwen3-asr-flash').trim(),
    ollamaApiKey: env.QWEN_ASR_OLLAMA_API_KEY?.trim() || '',
    ollamaBaseUrl,
    ollamaModel: (
      env.QWEN_ASR_OLLAMA_MODEL || 'frozenlab/qwen3-asr:latest'
    ).trim(),
    ollamaTimeoutMs: integer(env, 'QWEN_ASR_OLLAMA_TIMEOUT_MS', 300_000, {
      min: 5_000,
      max: 900_000,
    }),
    timeoutMs: integer(env, 'QWEN_ASR_TIMEOUT_MS', 120_000, {
      min: 5_000,
      max: 600_000,
    }),
    maxAudioMb: integer(env, 'QWEN_ASR_MAX_AUDIO_MB', 20, {
      min: 1,
      max: 200,
    }),
    maxDurationSec: integer(env, 'QWEN_ASR_MAX_DURATION_SEC', 300, {
      min: 1,
      max: 3_600,
    }),
    enableItn: boolean(env, 'QWEN_ASR_ENABLE_ITN', false),
  };
}
