import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Rastreador de conectividade simples (sem dependência externa):
 * navigator.onLine (web) + eventos online/offline + resume do app.
 * Offline-first real (fila de sync) fica para o app operacional — aqui
 * apenas tornamos o estado de erro offline EXPLÍCITO e acionável.
 */
export function useConnectivity(): boolean {
  // RN define navigator sem onLine (undefined) → trata como online (sem falso
  // positivo de "sem conexão" permanente no native).
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && navigator.onLine !== undefined ? navigator.onLine : true,
  );

  useEffect(() => {
    const update = (): void => {
      if (typeof navigator !== 'undefined' && navigator.onLine !== undefined) {
        setOnline(navigator.onLine);
      }
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        update();
      }
    });
    window.addEventListener?.('online', update);
    window.addEventListener?.('offline', update);
    return () => {
      subscription.remove();
      window.removeEventListener?.('online', update);
      window.removeEventListener?.('offline', update);
    };
  }, []);

  return online;
}
