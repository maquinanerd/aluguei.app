import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './icons';

export interface AvisoModoTesteProps {
  /** Nome do que está em teste: "Asaas", "Clicksign", "Serasa/SPC". */
  provedor: string;
  /** O que isso significa nesta tela, em uma frase. */
  children?: ReactNode;
  className?: string;
}

/**
 * Faixa "Modo de teste" das integrações que ainda não foram verificadas de
 * verdade (`IMPLEMENTED_NOT_LIVE_VERIFIED` em `docs/BLOCKERS.md`): cobrança
 * real, assinatura real e análise de crédito real.
 *
 * Existe para a tela nunca dar a entender que o efeito externo aconteceu.
 * Não é decoração: onde ela aparece, a ação real fica desabilitada.
 */
export function AvisoModoTeste({ provedor, children, className }: AvisoModoTesteProps) {
  return (
    <div className={cx('peg-aviso-teste', className)} role="status">
      <Icon name="alertTriangle" size={16} />
      <span>
        <strong>Modo de teste · {provedor}.</strong>{' '}
        {children ?? 'Nada é enviado ao provedor e nenhum valor é movimentado de verdade.'}
      </span>
    </div>
  );
}
