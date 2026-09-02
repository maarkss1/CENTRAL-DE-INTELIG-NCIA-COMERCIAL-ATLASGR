export type UiSound = 'navigate' | 'focus' | 'confirm' | 'success' | 'warning' | 'error';

const STORAGE_KEY = 'atlasgr:ui-sound-enabled';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      this.enabled = stored == null ? true : stored === 'true';
    }
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone({
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
    const context = this.initCtx();
    if (!context) return;

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

  isEnabled() {
    return this.enabled;
  }

  setEnabled(next: boolean) {
    this.enabled = next;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    }
    if (next) this.play('confirm');
  }

  toggleMute() {
    this.setEnabled(!this.enabled);
    return !this.enabled;
  }

  play(kind: UiSound) {
    if (!this.enabled) return;

    try {
      switch (kind) {
        case 'navigate':
          this.tone({ frequency: 420, endFrequency: 520, duration: 0.065, gain: 0.018 });
          break;
        case 'focus':
          this.tone({ frequency: 560, endFrequency: 610, duration: 0.045, gain: 0.014 });
          break;
        case 'confirm':
          this.tone({ frequency: 520, endFrequency: 680, duration: 0.07, gain: 0.02 });
          this.tone({ frequency: 680, endFrequency: 760, duration: 0.06, gain: 0.016, delay: 0.045 });
          break;
        case 'success':
          this.tone({ frequency: 520, endFrequency: 650, duration: 0.08, gain: 0.022 });
          this.tone({ frequency: 650, endFrequency: 880, duration: 0.1, gain: 0.018, delay: 0.06 });
          break;
        case 'warning':
          this.tone({ frequency: 420, endFrequency: 360, duration: 0.09, gain: 0.02, type: 'triangle' });
          break;
        case 'error':
          this.tone({ frequency: 260, endFrequency: 180, duration: 0.11, gain: 0.022, type: 'triangle' });
          break;
      }
    } catch {
      // Web Audio pode falhar em WebViews/navegadores que ainda não liberaram o contexto.
    }
  }

  // Compatibilidade com consumidores legados enquanto a revisão de UX migra chamadas antigas.
  playClick() {
    this.play('focus');
  }

  playSuccess() {
    this.play('success');
  }
}

export const SoundFX = new SoundEngine();
