#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createServices } from './asr.js';
import { guessMimeType } from './audio.js';
import { loadDotEnv, readConfig } from './config.js';

const HELP = `用法:
  node src/cli.js <audio...> [--json] [--out-dir <目录>] [--provider <模型服务>]

示例:
  node src/cli.js recordings/sz-001.wav
  node src/cli.js recordings/sz-001.wav --provider ollama
  node src/cli.js recordings/*.m4a --out-dir transcripts --json

环境变量见 .env.example。`;

async function main() {
  loadDotEnv();
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'out-dir': { type: 'string' },
      provider: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return;
  }

  const config = readConfig();
  const services = createServices(config);
  const providerId = values.provider?.trim() || config.provider;
  const service = services.get(providerId);
  if (!service) {
    throw new Error(
      `未知模型服务：${providerId}（可选：${[...services.keys()].join('、')}）`,
    );
  }
  if (!service.provider.isConfigured()) {
    throw new Error(`模型服务 ${providerId} 未配置，请先填写 .env`);
  }

  if (values['out-dir']) {
    await mkdir(values['out-dir'], { recursive: true });
  }

  const outputs = [];
  let failed = false;

  for (const filename of positionals) {
    try {
      console.error(`识别 ${filename} ...`);
      const buffer = await readFile(filename);
      const result = await service.transcribe({
        buffer,
        filename,
        maxDurationSec: config.maxDurationSec,
      });
      const output = { file: filename, ...result };
      outputs.push(output);

      if (values['out-dir']) {
        const stem = basename(filename, extname(filename));
        await writeFile(
          join(values['out-dir'], `${stem}.txt`),
          `${result.text}\n`,
          'utf8',
        );
        await writeFile(
          join(values['out-dir'], `${stem}.json`),
          `${JSON.stringify(output, null, 2)}\n`,
          'utf8',
        );
      }

      if (!values.json) {
        console.log(`\n[${filename}] ${result.durationSec.toFixed(1)}s`);
        console.log(result.text);
      }
    } catch (error) {
      failed = true;
      console.error(`\n[${filename}] 失败：${error.message}`);
    }
  }

  if (values.json) {
    console.log(JSON.stringify(outputs, null, 2));
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
