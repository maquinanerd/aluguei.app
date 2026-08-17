import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * O runtime do RN nativo define `navigator = { product: 'ReactNative' }` (sem
 * `onLine`) e `window = global` (sem `addEventListener`), mas o lib DOM do
 * tsconfig os tipa como navegador. Aqui tratamos a capacidade real por valor:
 * - `navigator.onLine !== false` cobre `undefined` (nativo → online, sem falso
 *   positivo de "sem conexão" permanente no native);
 * - listeners de janela são opcionais (ausentes no nativo).
 */
type BrowserWindow = Partial<Window>;

function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') {
    return true;
  }
  // O lib DOM tipa `navigator.onLine: boolean`, mas o RN nativo define
  // `navigator = { product: 'ReactNative' }` — `onLine` é `undefined` em
  // runtime. `!== false` cobre undefined → online (sem falso positivo no
  // native); não pode ser simplificado para `!navigator.onLine`.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
  return navigator.onLine !== false;
}

export function useConnectivity(): boolean {
  const [online, setOnline] = useState<boolean>(isBrowserOnline);

  useEffect(() => {
    const update = (): void => {
      setOnline(isBrowserOnline());
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        update();
      }
    });
    const win: BrowserWindow = window;
    win.addEventListener?.('online', update);
    win.addEventListener?.('offline', update);
    return () => {
      subscription.remove();
      win.removeEventListener?.('online', update);
      win.removeEventListener?.('offline', update);
    };
  }, []);

  return online;
}
