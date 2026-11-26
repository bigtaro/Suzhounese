import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AudioError, normalizeAudio } from '../src/audio.js';

const hasFfmpeg =
  spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0 &&
  spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;

function wavBuffer({ seconds = 1, sampleRate = 8000 } = {}) {
  const samples = Math.round(seconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test('normalizeAudio converts to 16 kHz mono PCM WAV', { skip: !hasFfmpeg }, async () => {
  const audio = await normalizeAudio(wavBuffer({ seconds: 1 }), {
    filename: 'sample.wav',
    maxDurationSec: 10,
  });

  try {
    assert.equal(audio.mimeType, 'audio/wav');
    assert.ok(Math.abs(audio.durationSec - 1) < 0.05);
    assert.equal(audio.buffer.subarray(0, 4).toString(), 'RIFF');
    assert.ok(audio.buffer.length > 16_000);
  } finally {
    await audio.cleanup();
  }
});

test('normalizeAudio rejects clips over the configured duration', { skip: !hasFfmpeg }, async () => {
  await assert.rejects(
    () =>
      normalizeAudio(wavBuffer({ seconds: 2 }), {
        filename: 'sample.wav',
        maxDurationSec: 1,
      }),
    (error) => error instanceof AudioError && error.statusCode === 413,
  );
});

test(
  'normalizeAudio handles MediaRecorder-style WebM without duration metadata',
  { skip: !hasFfmpeg },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'asr-live-webm-'));
    const filename = join(directory, 'recording.webm');

    try {
      const generated = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=1.2',
          '-c:a',
          'libopus',
          '-b:a',
          '32k',
          '-f',
          'webm',
          '-live',
          '1',
          filename,
        ],
        { encoding: 'utf8' },
      );
      assert.equal(generated.status, 0, generated.stderr);

      const input = readFileSync(filename);
      const audio = await normalizeAudio(input, {
        filename: 'recording.webm',
        maxDurationSec: 10,
      });
      try {
        assert.ok(Math.abs(audio.durationSec - 1.2) < 0.1);
        assert.equal(audio.buffer.subarray(0, 4).toString(), 'RIFF');
      } finally {
        await audio.cleanup();
      }

      await assert.rejects(
        () => normalizeAudio(input, { filename: 'recording.webm', maxDurationSec: 1 }),
        (error) => error instanceof AudioError && error.statusCode === 413,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('normalizeAudio rejects empty and malformed audio', async () => {
  await assert.rejects(() => normalizeAudio(Buffer.alloc(0)), /音频为空/);
  await assert.rejects(
    () =>
      normalizeAudio(Buffer.from('not audio'), {
        filename: 'broken.wav',
        maxDurationSec: 10,
      }),
    /无法读取音频/,
  );
});
