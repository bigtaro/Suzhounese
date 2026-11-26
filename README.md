# Suzhounese ASR

苏州方言语音识别项目。仓库现在包含一个可运行的 JavaScript ASR 应用：浏览器录音/上传音频，Node.js 服务把音频规范化后发送给 **Qwen3-ASR**，返回可校对、可下载的汉字转写。

> 当前实现使用 Qwen3-ASR 的云端或 OpenAI-compatible 接口，不做浏览器内模型推理。Qwen3-ASR 对苏州话属于 zero-shot 能力，实际 CER 仍需用本地测试集评测。

## 快速开始

要求：

- Node.js 22+
- `ffmpeg` / `ffprobe`
- 阿里云百炼（DashScope）API Key，或本地 Ollama
- 本地模式需要先执行 `ollama pull frozenlab/qwen3-asr:latest`

```bash
cp .env.example .env
# 编辑 .env，填入 QWEN_ASR_API_KEY
npm start
```

服务会自动加载项目根目录的 `.env`；如果根目录没有，也会兼容 `src/.env`。根目录配置优先。

打开 <http://127.0.0.1:8787>。项目没有第三方 npm 依赖，不需要先执行 `npm install`。

网页右上角可以在「阿里云 DashScope · qwen3-asr-flash」和「本地 Ollama ·
frozenlab/qwen3-asr:latest」之间切换，不需要改动原来的云端 API 地址和 Token。

如需先看界面和完整请求链路，可临时使用演示模式：

```bash
QWEN_ASR_PROVIDER=mock npm start
```

演示模式仍会调用本地 `ffmpeg` 检查音频，但不会把音频发给模型。

## 功能

- 浏览器麦克风录音，或拖入 WAV、MP3、M4A、WEBM、OGG、FLAC、MP4 等文件
- 本地统一转换为 16 kHz、单声道、PCM WAV
- 服务端调用 Qwen3-ASR，API Key 不进入浏览器
- 云端 DashScope 与本地 Ollama 模型可在页面中切换
- 转写结果可直接校对、复制和下载为 UTF-8 文本
- 命令行批处理，支持文本和 JSON 输出
- 音频大小、时长、请求超时和错误信息均有明确限制

## 配置

默认使用阿里云 DashScope 的 `qwen3-asr-flash`：

```dotenv
QWEN_ASR_API_KEY=sk-...
QWEN_ASR_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_ASR_MODEL=qwen3-asr-flash
```

国际站账号改用：

```dotenv
QWEN_ASR_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

| 变量 | 默认值 | 说明 |
|---|---|---|
| `QWEN_ASR_PROVIDER` | `dashscope` | 默认模型服务：`dashscope`、`openai-compatible`、`ollama` 或 `mock` |
| `QWEN_ASR_API_KEY` | 空 | 服务端凭据；不要写进前端代码 |
| `QWEN_ASR_BASE_URL` | DashScope 兼容地址 | 可指向自建服务 |
| `QWEN_ASR_MODEL` | `qwen3-asr-flash` | 云端模型或自建服务的模型名 |
| `QWEN_ASR_OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` | 本地 Ollama 地址 |
| `QWEN_ASR_OLLAMA_MODEL` | `frozenlab/qwen3-asr:latest` | 本地 Ollama 模型名 |
| `QWEN_ASR_OLLAMA_TIMEOUT_MS` | `300000` | 本地模型请求超时 |
| `QWEN_ASR_MAX_AUDIO_MB` | `20` | HTTP 请求体上限 |
| `QWEN_ASR_MAX_DURATION_SEC` | `300` | 单段音频时长上限 |
| `QWEN_ASR_TIMEOUT_MS` | `120000` | 模型请求超时 |
| `QWEN_ASR_ENABLE_ITN` | `false` | DashScope 数字/文本逆规范化；语料转写建议保持关闭 |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | 本地服务监听地址 |

### 本地 Ollama

原有的 `QWEN_ASR_BASE_URL`、`QWEN_ASR_API_KEY` 和 `QWEN_ASR_MODEL` 可以保持不变。
启动 Ollama 并拉取模型后，在网页右上角选择「本地 Ollama」即可：

```bash
ollama pull frozenlab/qwen3-asr:latest
npm start
```

Ollama 通过 OpenAI-compatible `/v1/audio/transcriptions` 接口接收音频；本地模式不需要
`QWEN_ASR_API_KEY`。如果 Ollama 不在默认端口，修改 `QWEN_ASR_OLLAMA_BASE_URL`。

### 自建或第三方服务

把 provider 改成 `openai-compatible`，再配置 `QWEN_ASR_BASE_URL` 和 `QWEN_ASR_MODEL`。服务需要接受以下 OpenAI-compatible 多模态消息：

```json
{
  "model": "Qwen/Qwen3-ASR-1.7B",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_audio",
          "input_audio": { "data": "data:audio/wav;base64,..." }
        }
      ]
    }
  ],
  "stream": false
}
```

DashScope 模式会额外发送 `asr_options.enable_lid` 和 `asr_options.enable_itn`；通用模式不会添加 DashScope 私有字段。

## 命令行

单文件：

```bash
node src/cli.js recordings/sz-001.wav
```

批量转写并输出 `.txt` + `.json`：

```bash
node src/cli.js recordings/*.m4a --out-dir transcripts --json
```

临时使用本地 Ollama 模型：

```bash
node src/cli.js recordings/sz-001.wav --provider ollama
```

也可以使用 npm script：

```bash
npm run transcribe -- recordings/sz-001.wav
```

## HTTP API

健康检查：

```bash
curl http://127.0.0.1:8787/api/health
```

原始音频上传（请求体就是文件内容，不做 multipart）：

```bash
curl -X POST \
  -H 'content-type: audio/wav' \
  --data-binary @sample.wav \
  'http://127.0.0.1:8787/api/transcribe?filename=sample.wav'
```

指定模型服务（默认使用 `QWEN_ASR_PROVIDER`）：

```bash
curl -X POST \
  -H 'content-type: audio/wav' \
  --data-binary @sample.wav \
  'http://127.0.0.1:8787/api/transcribe?filename=sample.wav&provider=ollama'
```

成功响应：

```json
{
  "ok": true,
  "text": "识别文本",
  "language": "Chinese",
  "durationSec": 5.42,
  "provider": "dashscope",
  "model": "qwen3-asr-flash",
  "elapsedMs": 1830
}
```

失败响应包含 `ok: false`、`error` 和机器可读的 `code`。缺少 API Key 时返回 `503`。

## 项目结构

```text
public/              录音和校对的浏览器界面
src/server.js        静态页面与 /api 路由
src/asr.js           音频规范化、推理和清理流程
src/audio.js         ffprobe 检查与 ffmpeg 转码
src/providers/       DashScope、本地 Ollama 与 mock provider
src/cli.js           批量转写命令行
test/                Node 内置测试
docs/                数据、语料和训练规划
```

## 测试

```bash
npm test
npm run check
```

测试不访问网络；需要本机安装 `ffmpeg` 才能运行音频转换用例。

## 当前限制

- 默认单段最多 5 分钟、20 MB，尚未实现长音频自动切块和跨块合并。
- 浏览器麦克风在 `localhost` 可用；如果通过局域网 IP 打开页面，需要 HTTPS 才能录音。
- 苏州话没有统一书写规范。Qwen3-ASR 可能输出普通话近似、同音字或空结果，必须用母语者校对。
- 音频会发送给配置的模型服务。采集和使用真实录音前，应取得说话人授权并遵守数据合规要求。
- 服务默认只监听 `127.0.0.1`。如果要暴露到局域网或公网，请自行增加身份认证、限流和 HTTPS。
- 本项目暂未包含 CER 评测和 LoRA 微调；这些仍在数据与训练规划中。

## 相关文档

- [项目规划](docs/PROJECT_PLAN.md)
- [语料获取方案](docs/DATA_ACQUISITION.md)
- [语料检索清单](docs/DATASET_SOURCES.md)
- [视频语料处理流程](docs/VIDEO_CORPUS_PIPELINE.md)
