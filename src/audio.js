import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 60_000;
const ALLOWED_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
  '.wma',
]);

export class AudioError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AudioError';
    this.statusCode = statusCode;
  }
}

function inputExtension(filename) {
  const extension = extname(filename || '').toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : '.input';
}

function firstErrorLine(error) {
  const detail = (error.stderr || error.stdout || '').trim().split('\n')[0];
  return detail ? `：${detail.slice(0, 240)}` : '';
}

async function probeDuration(sourcePath, ffprobePath) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      ffprobePath,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,duration',
        '-of',
        'json',
        sourcePath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
    ));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AudioError('未找到 ffprobe，请先安装 ffmpeg', 500);
    }
    throw new AudioError(`无法读取音频，请确认文件格式有效${firstErrorLine(error)}`, 422);
  }

  let probe;
  try {
    probe = JSON.parse(stdout);
  } catch {
    throw new AudioError('无法读取音频元数据', 422);
  }

  const audioStreams = (probe.streams || []).filter(
    (stream) => stream.codec_type === 'audio',
  );
  if (audioStreams.length === 0) {
    throw new AudioError('文件中没有找到音轨', 422);
  }

  const candidates = [
    probe.format?.duration,
    ...audioStreams.map((stream) => stream.duration),
  ];
  for (const candidate of candidates) {
    const durationSec = Number(candidate);
    if (Number.isFinite(durationSec) && durationSec > 0) return durationSec;
  }

  // MediaRecorder WebM/OGG streams often omit duration metadata. ffprobe can
  // still read them, so conversion and the normalized WAV determine duration.
  return null;
}

function wavDuration(buffer) {
  if (
    buffer.length < 44 ||
    buffer.subarray(0, 4).toString() !== 'RIFF' ||
    buffer.subarray(8, 12).toString() !== 'WAVE'
  ) {
    return null;
  }

  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString();
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkId === 'fmt ' && dataOffset + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(dataOffset + 8);
    } else if (chunkId === 'data') {
      dataSize = Math.min(chunkSize, Math.max(0, buffer.length - dataOffset));
      break;
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  if (byteRate <= 0 || dataSize <= 0) return null;
  return dataSize / byteRate;
}

async function convertToWav(sourcePath, targetPath, ffmpegPath, maxDurationSec) {
  try {
    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        sourcePath,
        '-map',
        '0:a:0',
        '-vn',
        '-t',
        String(maxDurationSec + 1),
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        '-f',
        'wav',
        targetPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AudioError('未找到 ffmpeg，请先安装 ffmpeg', 500);
    }
    throw new AudioError(
      `音频转码失败，请换一个文件或先转成 WAV/MP3${firstErrorLine(error)}`,
      422,
    );
  }
}

export async function normalizeAudio(
  input,
  {
    filename = '',
    maxDurationSec = 300,
    ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath = process.env.FFPROBE_PATH || 'ffprobe',
  } = {},
) {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new AudioError('音频为空', 400);
  }

  const workDir = await mkdtemp(join(tmpdir(), 'suzhou-asr-'));
  const sourcePath = join(workDir, `source${inputExtension(filename)}`);
  const outputPath = join(workDir, 'normalized.wav');
  const cleanup = () => rm(workDir, { recursive: true, force: true });

  try {
    await writeFile(sourcePath, input);
    const probedDuration = await probeDuration(sourcePath, ffprobePath);

    if (probedDuration !== null && probedDuration > maxDurationSec) {
      throw new AudioError(
        `音频长 ${Math.ceil(probedDuration)} 秒，超过当前上限 ${maxDurationSec} 秒`,
        413,
      );
    }

    await convertToWav(sourcePath, outputPath, ffmpegPath, maxDurationSec);
    const buffer = await readFile(outputPath);

    if (buffer.length === 0) {
      throw new AudioError('音频转码结果为空', 422);
    }

    const durationSec = probedDuration ?? wavDuration(buffer);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new AudioError('无法确定音频时长', 422);
    }
    if (durationSec > maxDurationSec) {
      throw new AudioError(
        `音频长 ${Math.ceil(durationSec)} 秒，超过当前上限 ${maxDurationSec} 秒`,
        413,
      );
    }

    return {
      buffer,
      mimeType: 'audio/wav',
      durationSec,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export function guessMimeType(filename) {
  const extension = extname(filename || '').toLowerCase();
  const types = {
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.oga': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.wma': 'audio/x-ms-wma',
  };
  return types[extension] || 'application/octet-stream';
}
