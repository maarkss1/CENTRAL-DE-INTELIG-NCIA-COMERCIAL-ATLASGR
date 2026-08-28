// Barramento de eventos minimalista para toasts globais — evita prop-drilling e
// dependências novas. Qualquer módulo chama toast.success/error/info; o componente
// <Toaster /> (montado uma vez no MainLayout) escuta e renderiza.

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

type Listener = (toast: ToastMessage) => void;

let nextId = 1;
const listeners = new Set<Listener>();

function emit(kind: ToastKind, text: string) {
  const message: ToastMessage = { id: nextId++, kind, text };
  listeners.forEach((l) => l(message));
}

export const toast = {
  success: (text: string) => emit('success', text),
  error: (text: string) => emit('error', text),
  info: (text: string) => emit('info', text),
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
