'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './icons';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (tone: ToastTone, title: string, body?: string) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
  warning: (title: string, body?: string) => void;
}

const TOAST_ICON: Record<ToastTone, IconName> = {
  success: 'checkCircle',
  error: 'alertCircle',
  warning: 'alertTriangle',
  info: 'info',
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = nextId.current++;
      const item: ToastItem = { id, tone, title };
      if (body !== undefined) {
        item.body = body;
      }
      setToasts((prev) => [...prev, item]);
      window.setTimeout(() => { dismiss(id); }, 5000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (t, b) => { toast('success', t, b); },
      error: (t, b) => { toast('error', t, b); },
      info: (t, b) => { toast('info', t, b); },
      warning: (t, b) => { toast('warning', t, b); },
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="peg-toast-viewport" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('peg-toast', `peg-toast--${t.tone}`)} role="status">
            <span className="peg-toast__icon">
              <Icon name={TOAST_ICON[t.tone]} size={16} />
            </span>
            <div className="peg-stack" style={{ gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</strong>
              {t.body ? <span style={{ color: 'var(--peg-text-secondary)' }}>{t.body}</span> : null}
            </div>
            <button
              type="button"
              onClick={() => { dismiss(t.id); }}
              aria-label="Fechar notificação"
              className="peg-tag__remove"
              style={{ marginLeft: 'auto' }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de ToastProvider');
  }
  return ctx;
}
