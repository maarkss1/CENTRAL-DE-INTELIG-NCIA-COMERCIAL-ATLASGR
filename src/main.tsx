import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// --- Efeitos Sonoros Globais ---
let audioCtx: AudioContext | null = null;

const playClickSound = () => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  
  if (!audioCtx) return;

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(600, audioCtx.currentTime); // Pitch agradável
  oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);

  gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); // Volume mais suave
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.05);
};

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('button') || target.closest('a') || target.closest('[role="button"]') || target.closest('input[type="submit"]')) {
    playClickSound();
  }
});

