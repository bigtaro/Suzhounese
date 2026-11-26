export class MockProvider {
  constructor() {
    this.id = 'mock';
    this.model = 'mock-qwen3-asr';
  }

  isConfigured() {
    return true;
  }

  async transcribe({ durationSec = 0 }) {
    return {
      text: `演示模式已接通 Qwen3-ASR 接口。这段 ${durationSec.toFixed(1)} 秒音频没有真的送去识别。填写 QWEN_ASR_API_KEY 后即可转写苏州话。`,
      language: 'zh',
    };
  }
}
