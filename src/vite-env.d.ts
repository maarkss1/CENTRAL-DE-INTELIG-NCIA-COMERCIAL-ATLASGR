/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Vendor prefix do Safari/iOS para a Web Audio API — não faz parte da lib "DOM" padrão. */
  webkitAudioContext?: typeof AudioContext;
}
