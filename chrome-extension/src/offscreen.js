// Documento offscreen (Manifest V3) — é o único contexto de extensão com DOM/MediaRecorder, por
// isso a gravação de verdade acontece aqui, nunca no service worker (background.js). Só é criado
// enquanto uma gravação está em andamento (ver ensureOffscreenDocument em background.js) e fechado
// logo depois do upload — não fica um processo escondido gravando indefinidamente.
import { copilotoApi } from './api.js';

const playbackEl = document.getElementById('playback');

/** @type {MediaStream|null} */
let mediaStream = null;
/** @type {MediaRecorder|null} */
let mediaRecorder = null;
/** @type {BlobPart[]} */
let chunks = [];
let recordingStartedAt = 0;
let currentConversationId = null;

function pickSupportedMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
}

async function startRecording(streamId, conversationId) {
  if (mediaRecorder) {
    throw new Error('Já existe uma gravação em andamento neste documento offscreen.');
  }

  // Constraint documentada pelo Chrome para consumir um streamId obtido via
  // `chrome.tabCapture.getMediaStreamId` — é a sintaxe legada de constraints "mandatory", ainda
  // exigida especificamente para este caso (tabCapture + offscreen), não uma escolha nossa.
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // Sem isto o usuário perde o áudio da própria reunião assim que a captura da aba começa
  // (comportamento padrão do Chrome) — reencaminha o stream capturado de volta pro alto-falante.
  playbackEl.srcObject = mediaStream;

  const mimeType = pickSupportedMimeType();
  chunks = [];
  currentConversationId = conversationId;
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  recordingStartedAt = Date.now();
  // Timeslice de 5s: gera chunks periódicos em vez de um único blob gigante montado só no fim —
  // reduz o risco de perder a gravação inteira se algo quebrar perto do fim da reunião.
  mediaRecorder.start(5000);
}

function waitForRecorderStop() {
  return new Promise((resolve) => {
    mediaRecorder.addEventListener('stop', resolve, { once: true });
    mediaRecorder.stop();
  });
}

async function stopRecordingAndUpload() {
  if (!mediaRecorder || !mediaStream) {
    throw new Error('Nenhuma gravação em andamento.');
  }

  const mimeType = mediaRecorder.mimeType;
  const conversationId = currentConversationId;
  const durationMs = Date.now() - recordingStartedAt;

  await waitForRecorderStop();
  mediaStream.getTracks().forEach((track) => track.stop());
  playbackEl.srcObject = null;

  const blob = new Blob(chunks, { type: mimeType });
  chunks = [];
  mediaRecorder = null;
  mediaStream = null;
  currentConversationId = null;

  if (blob.size === 0) {
    throw new Error('Gravação vazia — nenhum áudio foi capturado.');
  }

  const { signedUrl, objectKey } = await copilotoApi.requestAudioUploadUrl(conversationId, mimeType);

  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload do áudio para o storage falhou (HTTP ${uploadRes.status}).`);
  }

  await copilotoApi.completeAudioUpload(conversationId, {
    objectKey,
    mimeType,
    sizeBytes: blob.size,
    durationMs,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OFFSCREEN_START_RECORDING') {
    startRecording(message.streamId, message.conversationId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (message?.type === 'OFFSCREEN_STOP_RECORDING') {
    stopRecordingAndUpload()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});
