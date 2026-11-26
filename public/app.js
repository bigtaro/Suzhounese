const $ = (selector) => document.querySelector(selector);

const elements = {
  serviceStatus: $('#service-status'),
  statusText: $('#status-text'),
  providerSelect: $('#provider-select'),
  setupNote: $('#setup-note'),
  limitHint: $('#limit-hint'),
  dropZone: $('#drop-zone'),
  fileInput: $('#file-input'),
  recordButton: $('#record-button'),
  fileButton: $('#file-button'),
  dropTitle: $('#drop-title'),
  dropHint: $('#drop-hint'),
  recordingPanel: $('#recording-panel'),
  recordingTimer: $('#recording-timer'),
  previewPanel: $('#preview-panel'),
  fileName: $('#file-name'),
  audioPreview: $('#audio-preview'),
  clearButton: $('#clear-button'),
  transcribeButton: $('#transcribe-button'),
  errorBanner: $('#error-banner'),
  errorMessage: $('#error-message'),
  dismissError: $('#dismiss-error'),
  transcript: $('#transcript'),
  resultMeta: $('#result-meta'),
  copyButton: $('#copy-button'),
  downloadButton: $('#download-button'),
};

const state = {
  file: null,
  previewUrl: null,
  recorder: null,
  stream: null,
  chunks: [],
  timerId: null,
  startedAt: 0,
  busy: false,
  maxAudioMb: 20,
  maxDurationSec: 300,
  providers: [],
};

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorBanner.hidden = false;
}

function hideError() {
  elements.errorBanner.hidden = true;
  elements.errorMessage.textContent = '';
}

function setBusy(busy) {
  state.busy = busy;
  elements.recordButton.disabled = busy;
  elements.fileButton.disabled = busy;
  elements.clearButton.disabled = busy;
  elements.providerSelect.disabled = busy;
}

function setStatus(text, tone = 'ready') {
  elements.serviceStatus.classList.remove('is-loading', 'is-warning');
  if (tone === 'warning') elements.serviceStatus.classList.add('is-warning');
  elements.statusText.textContent = text;
}

function updateLimits(data) {
  state.maxAudioMb = data.limits?.maxAudioMb ?? state.maxAudioMb;
  state.maxDurationSec = data.limits?.maxDurationSec ?? state.maxDurationSec;
  const duration =
    state.maxDurationSec >= 60
      ? `${Math.floor(state.maxDurationSec / 60)} 分钟`
      : `${state.maxDurationSec} 秒`;
  elements.limitHint.textContent = `最长 ${duration} · ${state.maxAudioMb} MB`;
}

function providerLabel(provider) {
  const name =
    provider.label ||
    (provider.id === 'ollama'
      ? '本地 Ollama'
      : provider.id === 'dashscope'
        ? '阿里云 DashScope'
        : provider.id === 'mock'
          ? '演示模式'
          : provider.id);
  return `${name} · ${provider.model}`;
}

function selectedProvider() {
  return state.providers.find(
    (provider) => provider.id === elements.providerSelect.value,
  );
}

function updateProviderStatus() {
  const provider = selectedProvider();
  if (!provider) return;

  if (provider.id === 'mock') {
    setStatus('演示模式');
    elements.setupNote.hidden = true;
    return;
  }

  if (!provider.configured) {
    setStatus('缺少凭据', 'warning');
    elements.setupNote.hidden = false;
    return;
  }

  setStatus(
    provider.id === 'ollama'
      ? '本地 Ollama 已启用'
      : provider.id === 'dashscope'
        ? 'Qwen3-ASR 已连接'
        : `${provider.label || provider.id} 已连接`,
  );
  elements.setupNote.hidden = true;
}

function populateProviders(data) {
  const providers =
    Array.isArray(data.providers) && data.providers.length
      ? data.providers
      : [
          {
            id: data.provider,
            label: data.provider === 'ollama' ? '本地 Ollama' : undefined,
            model: data.model,
            configured: data.configured,
          },
        ];

  state.providers = providers;
  elements.providerSelect.replaceChildren(
    ...providers.map((provider) => {
      const option = document.createElement('option');
      option.value = provider.id;
      option.textContent = providerLabel(provider);
      return option;
    }),
  );

  const preferred =
    providers.find((provider) => provider.id === data.provider && provider.configured) ||
    providers.find((provider) => provider.configured) ||
    providers[0];
  if (preferred) elements.providerSelect.value = preferred.id;
}

async function loadHealth() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('健康检查失败');
    const data = await response.json();
    updateLimits(data);
    populateProviders(data);
    updateProviderStatus();
  } catch (error) {
    setStatus('服务未连接', 'warning');
    showError(`无法连接本地服务：${error.message}`);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTimer(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function fileStem(filename) {
  return (filename || 'transcript').replace(/\.[^.]+$/, '') || 'transcript';
}

function revokePreview() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
}

function validateFile(file) {
  if (!file) return false;
  if (file.size === 0) {
    showError('这个文件是空的。');
    return false;
  }
  if (file.size > state.maxAudioMb * 1024 * 1024) {
    showError(`文件超过 ${state.maxAudioMb} MB 上限。`);
    return false;
  }

  const type = file.type || '';
  if (type && !type.startsWith('audio/') && !type.startsWith('video/')) {
    showError('请选择音频或视频文件。');
    return false;
  }
  return true;
}

function setFile(file) {
  if (state.busy) return;
  if (!validateFile(file)) return;
  hideError();
  revokePreview();
  state.file = file;
  state.previewUrl = URL.createObjectURL(file);

  elements.audioPreview.src = state.previewUrl;
  elements.fileName.textContent = `${file.name} · ${formatBytes(file.size)}`;
  elements.previewPanel.hidden = false;
  elements.dropTitle.textContent = '音频已经准备好';
  elements.dropHint.textContent = '可以试听，或直接开始识别';
  elements.transcribeButton.disabled = false;
  elements.transcribeButton.classList.remove('is-busy');
  elements.transcribeButton.textContent = '识别这段音频';
}

function clearSource() {
  revokePreview();
  state.file = null;
  elements.audioPreview.removeAttribute('src');
  elements.audioPreview.load();
  elements.previewPanel.hidden = true;
  elements.fileInput.value = '';
  elements.dropTitle.textContent = '点按麦克风开始录音';
  elements.dropHint.textContent = '也可以把音频文件拖到这里';
}

function chooseFile() {
  if (state.busy) return;
  hideError();
  elements.fileInput.click();
}

function supportedRecordingType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function updateRecordingUi(recording) {
  elements.dropZone.classList.toggle('is-recording', recording);
  elements.recordingPanel.hidden = !recording;
  elements.recordButton.textContent = recording ? '停止录音' : '开始录音';
  elements.dropTitle.textContent = recording ? '正在听你说苏州话…' : '点按麦克风开始录音';
  elements.dropHint.textContent = recording
    ? '点按红色按钮结束录音'
    : '也可以把音频文件拖到这里';
}

function stopTracks() {
  for (const track of state.stream?.getTracks() || []) track.stop();
  state.stream = null;
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function finishRecording(recorder) {
  const chunks = state.chunks;
  const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm';
  const extension = mimeType.includes('mp4')
    ? 'm4a'
    : mimeType.includes('ogg')
      ? 'ogg'
      : 'webm';
  const blob = new Blob(chunks, { type: mimeType });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);

  stopTimer();
  stopTracks();
  state.recorder = null;
  state.chunks = [];
  updateRecordingUi(false);

  if (blob.size === 0) {
    showError('没有录到音频，请再试一次。');
    return;
  }

  setFile(
    new File([blob], `suzhou-recording-${stamp}.${extension}`, {
      type: mimeType,
    }),
  );
}

async function startRecording() {
  if (state.busy) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showError('当前浏览器不支持录音，请改用文件上传。');
    return;
  }

  hideError();
  clearSource();
  elements.recordButton.disabled = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const mimeType = supportedRecordingType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    state.stream = stream;
    state.recorder = recorder;
    state.chunks = [];
    state.startedAt = performance.now();

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) state.chunks.push(event.data);
    });
    recorder.addEventListener('stop', () => finishRecording(recorder), { once: true });
    recorder.addEventListener('error', (event) => {
      showError(`录音失败：${event.error?.message || '未知错误'}`);
      stopRecording();
    });
    recorder.start(500);
    updateRecordingUi(true);
    elements.recordingTimer.textContent = '00:00';

    state.timerId = setInterval(() => {
      const elapsed = performance.now() - state.startedAt;
      elements.recordingTimer.textContent = formatTimer(elapsed);
      if (elapsed >= state.maxDurationSec * 1000) stopRecording();
    }, 250);
  } catch (error) {
    showError(`无法打开麦克风：${error.message}`);
    stopTracks();
    updateRecordingUi(false);
  } finally {
    elements.recordButton.disabled = false;
  }
}

function stopRecording() {
  const recorder = state.recorder;
  if (!recorder || recorder.state === 'inactive') return;
  elements.recordButton.disabled = true;
  recorder.stop();
  elements.recordButton.disabled = false;
}

async function transcribe() {
  if (!state.file || state.busy) return;
  hideError();
  setBusy(true);
  elements.transcribeButton.disabled = true;
  elements.transcribeButton.classList.add('is-busy');
  elements.transcribeButton.textContent = '识别中';
  elements.resultMeta.textContent = '正在识别…';

  try {
    const params = new URLSearchParams({
      filename: state.file.name,
      provider: elements.providerSelect.value,
    });
    const response = await fetch(`/api/transcribe?${params}`, {
      method: 'POST',
      headers: {
        'content-type': state.file.type || 'application/octet-stream',
      },
      body: state.file,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `识别失败 (HTTP ${response.status})`);
    }

    elements.transcript.value = data.text || '';
    const language = data.language ? ` · ${data.language}` : '';
    elements.resultMeta.textContent = `${Number(data.durationSec).toFixed(1)} 秒 · ${(
      data.elapsedMs / 1000
    ).toFixed(1)} 秒耗时${language}`;
    updateResultActions();
    elements.transcript.focus();
  } catch (error) {
    elements.resultMeta.textContent = '识别失败';
    showError(error.message);
  } finally {
    setBusy(false);
    elements.transcribeButton.disabled = false;
    elements.transcribeButton.classList.remove('is-busy');
    elements.transcribeButton.textContent = '重新识别';
  }
}

function updateResultActions() {
  const hasText = Boolean(elements.transcript.value.trim());
  elements.copyButton.disabled = !hasText;
  elements.downloadButton.disabled = !hasText;
}

async function copyTranscript() {
  const text = elements.transcript.value;
  if (!text.trim()) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    elements.transcript.select();
    document.execCommand('copy');
  }

  const previous = elements.copyButton.textContent;
  elements.copyButton.textContent = '已复制';
  setTimeout(() => {
    elements.copyButton.textContent = previous;
  }, 1200);
}

function downloadTranscript() {
  const text = elements.transcript.value;
  if (!text.trim()) return;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileStem(state.file?.name)}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function bindEvents() {
  elements.recordButton.addEventListener('click', () => {
    if (state.recorder) stopRecording();
    else startRecording();
  });

  elements.fileButton.addEventListener('click', chooseFile);
  elements.fileInput.addEventListener('change', () => {
    setFile(elements.fileInput.files?.[0]);
  });
  elements.clearButton.addEventListener('click', clearSource);
  elements.providerSelect.addEventListener('change', () => {
    hideError();
    updateProviderStatus();
  });
  elements.transcribeButton.addEventListener('click', transcribe);
  elements.copyButton.addEventListener('click', copyTranscript);
  elements.downloadButton.addEventListener('click', downloadTranscript);
  elements.transcript.addEventListener('input', updateResultActions);
  elements.dismissError.addEventListener('click', hideError);

  elements.dropZone.addEventListener('click', (event) => {
    if (event.target.closest('button') || state.recorder) return;
    chooseFile();
  });
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.target.closest('button')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      chooseFile();
    }
  });

  for (const type of ['dragenter', 'dragover']) {
    elements.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add('is-dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    elements.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove('is-dragging');
    });
  }
  elements.dropZone.addEventListener('drop', (event) => {
    setFile(event.dataTransfer?.files?.[0]);
  });

  window.addEventListener('beforeunload', () => {
    stopTimer();
    stopTracks();
    revokePreview();
  });
}

function init() {
  bindEvents();
  loadHealth();
}

init();
