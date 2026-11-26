import { normalizeAudio } from './audio.js';
import { createProvider, createProviders } from './providers/index.js';

export class AsrService {
  constructor({ provider, normalize = normalizeAudio, now = () => performance.now() }) {
    this.provider = provider;
    this.normalize = normalize;
    this.now = now;
  }

  async transcribe({ buffer, filename, signal, ...audioOptions }) {
    const startedAt = this.now();
    const audio = await this.normalize(buffer, { filename, ...audioOptions });

    try {
      const result = await this.provider.transcribe({
        audio: audio.buffer,
        mimeType: audio.mimeType,
        durationSec: audio.durationSec,
        filename,
        signal,
      });

      return {
        text: result.text,
        language: result.language ?? null,
        durationSec: Number(audio.durationSec.toFixed(2)),
        provider: this.provider.id,
        model: this.provider.model,
        elapsedMs: Math.round(this.now() - startedAt),
      };
    } finally {
      await audio.cleanup?.();
    }
  }
}

export function createAsrService(config, options = {}) {
  const provider = options.provider || createProvider(config, options);
  return new AsrService({
    provider,
    normalize: options.normalize,
    now: options.now,
  });
}

export function createServices(config, options = {}) {
  const providers = options.providers || createProviders(config, options);
  return new Map(
    providers.map((provider) => [
      provider.id,
      new AsrService({
        provider,
        normalize: options.normalize,
        now: options.now,
      }),
    ]),
  );
}
