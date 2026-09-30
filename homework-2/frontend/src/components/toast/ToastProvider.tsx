import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastKind } from './ToastContext';
import styles from './Toast.module.css';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const SUCCESS_TIMEOUT_MS = 4000;

/**
 * Holds the visible toasts and renders them. Screen readers hear them through two live regions:
 * success is "polite" (announced after the current speech), errors are "assertive" (announced at once).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((toast) => toast.id !== id)), []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, message, kind }]);
      if (kind === 'success') setTimeout(() => dismiss(id), SUCCESS_TIMEOUT_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  const region = (kind: ToastKind) => (
    <div className={styles.region} aria-live={kind === 'error' ? 'assertive' : 'polite'} data-kind={kind}>
      {toasts
        .filter((toast) => toast.kind === kind)
        .map((toast) => (
          <div key={toast.id} className={styles.toast} data-kind={toast.kind} role={kind === 'error' ? 'alert' : 'status'}>
            <span className={styles.message}>{toast.message}</span>
            <button type="button" className={styles.close} onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ))}
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.stack}>
        {region('error')}
        {region('success')}
      </div>
    </ToastContext.Provider>
  );
}
