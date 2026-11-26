import assert from 'node:assert/strict';
import test from 'node:test';
import { AsrService } from '../src/asr.js';

test('AsrService normalizes, transcribes, and cleans up', async () => {
  let cleaned = false;
  let received;
  const times = [100, 350];
  const service = new AsrService({
    provider: {
      id: 'dashscope',
      model: 'qwen3-asr-flash',
      async transcribe(input) {
        received = input;
        return { text: '苏州话', language: 'zh' };
      },
    },
    normalize: async () => ({
      buffer: Buffer.from('wav'),
      mimeType: 'audio/wav',
      durationSec: 12.345,
      cleanup: async () => {
        cleaned = true;
      },
    }),
    now: () => times.shift(),
  });

  const result = await service.transcribe({ buffer: Buffer.from('input') });

  assert.equal(received.mimeType, 'audio/wav');
  assert.equal(received.durationSec, 12.345);
  assert.equal(cleaned, true);
  assert.deepEqual(result, {
    text: '苏州话',
    language: 'zh',
    durationSec: 12.35,
    provider: 'dashscope',
    model: 'qwen3-asr-flash',
    elapsedMs: 250,
  });
});

test('AsrService cleans up when inference fails', async () => {
  let cleaned = false;
  const service = new AsrService({
    provider: {
      id: 'dashscope',
      model: 'qwen3-asr-flash',
      async transcribe() {
        throw new Error('inference failed');
      },
    },
    normalize: async () => ({
      buffer: Buffer.from('wav'),
      mimeType: 'audio/wav',
      durationSec: 1,
      cleanup: async () => {
        cleaned = true;
      },
    }),
  });

  await assert.rejects(() => service.transcribe({ buffer: Buffer.from('input') }), /inference failed/);
  assert.equal(cleaned, true);
});
