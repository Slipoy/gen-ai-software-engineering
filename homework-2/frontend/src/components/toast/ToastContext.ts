import { createContext } from 'react';

export type ToastKind = 'success' | 'error';

export interface ToastApi {
  /** Shows a short message in the corner. Success messages disappear by themselves; errors stay until closed. */
  show: (message: string, kind?: ToastKind) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);
