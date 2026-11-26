import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServices } from './asr.js';
import { loadDotEnv, readConfig } from './config.js';

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

class HttpError extends Error {
  constructor(statusCode, message, code = 'http_error') {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function commonHeaders() {
  return {
    'content-security-policy':
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...commonHeaders(),
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

function sendError(res, error) {
  const statusCode =
    Number.isInteger(error.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;
  const message = error.statusCode ? error.message : '服务器内部错误';
  sendJson(res, statusCode, {
    ok: false,
    error: message,
    code: error.code || 'internal_error',
  });
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  let exceeded = false;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      exceeded = true;
      continue;
    }
    chunks.push(chunk);
  }

  if (exceeded) {
    throw new HttpError(413, `音频超过 ${Math.round(maxBytes / 1024 / 1024)} MB 上限`, 'audio_too_large');
  }
  return Buffer.concat(chunks);
}

function acceptsAudio(contentType) {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return (
    mime.startsWith('audio/') ||
    mime.startsWith('video/') ||
    mime === 'application/octet-stream'
  );
}

async function serveStatic(req, res, pathname, publicDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, 'Method Not Allowed', 'method_not_allowed');
  }

  if (pathname === '/favicon.ico') {
    res.writeHead(204, commonHeaders());
    res.end();
    return;
  }

  let relativePath;
  try {
    relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  } catch {
    throw new HttpError(400, 'Bad Request', 'bad_request');
  }
  const filePath = resolve(publicDir, relativePath);
  if (filePath !== resolve(publicDir) && !filePath.startsWith(`${resolve(publicDir)}${sep}`)) {
    throw new HttpError(403, 'Forbidden', 'forbidden');
  }

  let body;
  try {
    body = await readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      throw new HttpError(404, 'Not Found', 'not_found');
    }
    throw error;
  }

  const extension = extname(filePath).toLowerCase();
  res.writeHead(200, {
    ...commonHeaders(),
    'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
    'content-length': body.length,
    'content-type': CONTENT_TYPES[extension] || 'application/octet-stream',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

export function createRequestHandler({
  config,
  service,
  services,
  publicDir = DEFAULT_PUBLIC_DIR,
}) {
  const serviceMap =
    services || new Map(service ? [[service.provider.id, service]] : []);
  const defaultService =
    service || serviceMap.get(config.provider) || serviceMap.values().next().value;

  if (!defaultService) {
    throw new Error('至少需要一个 ASR 模型服务');
  }

  const providerEntries = () =>
    [...serviceMap.values()].map(({ provider }) => ({
      id: provider.id,
      label: provider.label || provider.id,
      model: provider.model,
      configured: provider.isConfigured(),
    }));

  return async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          provider: defaultService.provider.id,
          model: defaultService.provider.model,
          configured: defaultService.provider.isConfigured(),
          providers: providerEntries(),
          limits: {
            maxAudioMb: config.maxAudioMb,
            maxDurationSec: config.maxDurationSec,
          },
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/transcribe') {
        const contentType = req.headers['content-type'] || 'application/octet-stream';
        if (!acceptsAudio(contentType)) {
          throw new HttpError(415, '请上传音频或视频文件', 'unsupported_media_type');
        }

        const maxBytes = config.maxAudioMb * 1024 * 1024;
        const body = await readBody(req, maxBytes);
        if (body.length === 0) {
          throw new HttpError(400, '请求中没有音频数据', 'empty_audio');
        }

        const filename =
          url.searchParams.get('filename') || req.headers['x-audio-filename'] || '';
        const abortController = new AbortController();
        res.once('close', () => abortController.abort());

        const requestedProvider = url.searchParams.get('provider')?.trim();
        const selectedService = requestedProvider
          ? serviceMap.get(requestedProvider)
          : defaultService;
        if (!selectedService) {
          throw new HttpError(
            400,
            `未知模型服务：${requestedProvider}（可选：${[...serviceMap.keys()].join('、')}）`,
            'unknown_provider',
          );
        }

        const result = await selectedService.transcribe({
          buffer: body,
          filename,
          maxDurationSec: config.maxDurationSec,
          signal: abortController.signal,
        });
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (pathname.startsWith('/api/')) {
        throw new HttpError(404, 'Not Found', 'not_found');
      }

      await serveStatic(req, res, pathname, publicDir);
    } catch (error) {
      if (!res.headersSent) {
        sendError(res, error);
      } else {
        res.end();
      }
      if (error.code !== 'not_configured' && (!error.statusCode || error.statusCode >= 500)) {
        console.error(error);
      }
    }
  };
}

export function createHttpServer({
  config,
  service,
  services,
  publicDir = DEFAULT_PUBLIC_DIR,
}) {
  return createServer(
    createRequestHandler({ config, service, services, publicDir }),
  );
}

async function main() {
  loadDotEnv();
  const config = readConfig();
  const services = createServices(config);
  const server = createHttpServer({ config, services });

  server.listen(config.port, config.host, () => {
    const address = server.address();
    const host = typeof address === 'object' && address ? address.address : config.host;
    const port = typeof address === 'object' && address ? address.port : config.port;
    console.log(`Suzhounese ASR: http://${host}:${port}`);
    for (const { provider } of services.values()) {
      const state = provider.isConfigured() ? '已配置' : '缺少凭据';
      console.log(`ASR: ${provider.label} · ${provider.model} (${provider.id}, ${state})`);
    }
    if (![...services.values()].some(({ provider }) => provider.isConfigured())) {
      console.warn('没有可用的 ASR 模型服务：请配置 QWEN_ASR_API_KEY 或启动本地 Ollama。');
    }
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { HttpError };
