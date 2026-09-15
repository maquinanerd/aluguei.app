import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Elementos focáveis e visíveis do painel, na ordem do documento. */
function focusablesIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 || el === document.activeElement,
  );
}

/**
 * Foco de diálogo modal, compartilhado por Modal e Drawer: ao abrir, o foco vai
 * para o primeiro elemento focável do painel; Tab e Shift+Tab circulam dentro
 * dele; Escape chama `onClose`; ao fechar, o foco volta para quem abriu.
 *
 * O efeito depende só de `open`. Com `onClose` nas dependências, ele rodava de
 * novo a cada render da tela (toda tela passa uma função nova): cada tecla num
 * campo controlado devolvia o foco ao gatilho e o levava para "Fechar", e o
 * espaço seguinte fechava o diálogo. A referência guarda o `onClose` mais
 * recente sem reexecutar o efeito — o mesmo padrão do Modal do design system do
 * Kal El. A lista de focáveis é lida a cada Tab porque o conteúdo do diálogo
 * muda enquanto ele está aberto.
 */
export function useDialogFocus(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusablesIn(panel)[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusablesIn(panel);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, panelRef]);
}
