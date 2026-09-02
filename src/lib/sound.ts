export type UiSound = 'navigate' | 'focus' | 'confirm' | 'success' | 'warning' | 'error';

const STORAGE_KEY = 'atlasgr:ui-sound-enabled';

let audioContext: AudioContext | null = null;
let enabled = true;

if (typeof window !== 'undefined') {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  enabled = stored == null ? true : stored === 'true';
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  audioContext = new AudioContextClass();
  return audioContext;
}

function tone({
  frequency,
  endFrequency = frequency,
  duration,
  gain = 0.028,
  delay = 0,
  type = 'sine',
}: {
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain?: number;
  delay?: number;
  type?: OscillatorType;
}) {
  const context = ensureContext();
  if (!context) return;

  if (context.state === 'suspended') void context.resume();

  const startAt = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(endFrequency, 1), startAt + duration);

  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(gain, startAt + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.015);
}

export function isUiSoundEnabled() {
  return enabled;
}

export function setUiSoundEnabled(next: boolean) {
  enabled = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }

  if (next) {
    playUiSound('confirm');
  }
}

/**
 * Feedback sonoro curto e semântico. Nunca toca sozinho: só é acionado por uma interação,
 * navegação concluída ou feedback explícito da interface. Mantém o produto silencioso o bastante
 * para uso contínuo e evita o antigo comportamento de emitir o mesmo bip em todo clique.
 */
export function playUiSound(kind: UiSound) {
  if (!enabled) return;

  switch (kind) {
    case 'navigate':
      tone({ frequency: 420, endFrequency: 520, duration: 0.065, gain: 0.018 });
      break;
    case 'focus':
      tone({ frequency: 560, endFrequency: 610, duration: 0.045, gain: 0.014 });
      break;
    case 'confirm':
      tone({ frequency: 520, endFrequency: 680, duration: 0.07, gain: 0.02 });
      tone({ frequency: 680, endFrequency: 760, duration: 0.06, gain: 0.016, delay: 0.045 });
      break;
    case 'success':
      tone({ frequency: 520, endFrequency: 650, duration: 0.08, gain: 0.022 });
      tone({ frequency: 650, endFrequency: 880, duration: 0.1, gain: 0.018, delay: 0.06 });
      break;
    case 'warning':
      tone({ frequency: 420, endFrequency: 360, duration: 0.09, gain: 0.02, type: 'triangle' });
      break;
    case 'error':
      tone({ frequency: 260, endFrequency: 180, duration: 0.11, gain: 0.022, type: 'triangle' });
      break;
  }
}
