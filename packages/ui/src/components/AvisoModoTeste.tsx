import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './icons';

/**
 * Formas do aviso nos prints da gestão e da área do cliente (ADR-105, spec da Onda 1C, §6):
 *
 * - `padrao`: a faixa de antes, com ícone e "Modo de teste · provedor." — fica nas telas até a onda
 *   de cada uma trocar pela forma do print.
 * - `faixa`: faixa com o selo branco "Modo de teste", o texto e uma ação opcional ("Saiba mais"),
 *   `03-ajustes.dc.html:31` (cobrança).
 * - `selo`: só o selo, para o cabeçalho de um bloco, `03-ajustes.dc.html:60` (envelope de assinatura).
 * - `caixa`: caixa sem borda com "!", `02-complementos.dc.html:87`; `larga` ocupa a linha toda em
 *   12,5px, `05-area-do-cliente.dc.html:94` (Pix).
 * - `alerta`: faixa com borda e "!", sem o selo, `03-ajustes.dc.html:69` (análise cadastral).
 */
export type FormaDoAviso = 'padrao' | 'faixa' | 'selo' | 'caixa' | 'alerta';

export interface AvisoModoTesteProps {
  /** Nome do que está em teste: "Asaas", "Clicksign", "Serasa/SPC". A forma `padrao` o mostra. */
  provedor?: string;
  /** O que isso significa nesta tela, em uma frase. */
  children?: ReactNode;
  forma?: FormaDoAviso;
  /** Ação ao fim da faixa (`faixa`): "Saiba mais". */
  acao?: ReactNode;
  /** `caixa` na largura toda e em 12,5px (tela do Pix). */
  larga?: boolean;
  className?: string;
}

const SELO = 'Modo de teste';

/**
 * Aviso "Modo de teste" das integrações que ainda não foram verificadas de verdade
 * (`IMPLEMENTED_NOT_LIVE_VERIFIED` em `docs/BLOCKERS.md`): cobrança real, assinatura real e análise
 * de crédito real.
 *
 * Existe para a tela nunca dar a entender que o efeito externo aconteceu. Não é decoração: onde ele
 * aparece, a ação real fica desabilitada.
 */
export function AvisoModoTeste({
  provedor,
  children,
  forma = 'padrao',
  acao,
  larga = false,
  className,
}: AvisoModoTesteProps) {
  switch (forma) {
    case 'selo':
      return <span className={cx('peg-aviso-selo', className)}>{SELO}</span>;
    case 'faixa':
      return (
        <div className={cx('peg-aviso-faixa', className)} role="status">
          <span className="peg-aviso-selo peg-aviso-selo--branco">{SELO}</span>
          <span className="peg-aviso-faixa__texto">{children}</span>
          {acao === undefined ? null : <span className="peg-aviso-faixa__acao">{acao}</span>}
        </div>
      );
    case 'caixa':
    case 'alerta':
      return (
        <div
          className={cx(
            forma === 'caixa' ? 'peg-aviso-caixa' : 'peg-aviso-alerta',
            larga && 'peg-aviso-caixa--larga',
            className,
          )}
          role="status"
        >
          <span className="peg-aviso__marca" aria-hidden="true">
            !
          </span>
          <span>{children}</span>
        </div>
      );
    case 'padrao':
      return (
        <div className={cx('peg-aviso-teste', className)} role="status">
          <Icon name="alertTriangle" size={16} />
          <span>
            <strong>
              {SELO}
              {provedor === undefined ? '' : ` · ${provedor}`}.
            </strong>{' '}
            {children ?? 'Nada é enviado ao provedor e nenhum valor é movimentado de verdade.'}
          </span>
        </div>
      );
  }
}
