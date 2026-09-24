import type { ReactNode } from 'react';
import { BRAND } from '@/lib/brand';

export interface AuthShellProps {
  children: ReactNode;
  /** Ação no topo do cartão (sair, voltar), quando a tela tem uma. */
  acaoTopo?: ReactNode;
  /** Rótulo da região, para quem navega por leitor de tela. */
  rotulo?: string;
}

/**
 * Moldura das telas de entrada e conta (Onda 3): login, cadastro, convite,
 * senha e situação da conta.
 *
 * Existe para a marca aparecer em um lugar só. Antes, cada uma das seis telas
 * repetia o mesmo bloco do logotipo — e foi assim que o nome antigo do produto
 * sobreviveu em tela durante o rebranding.
 */
export function AuthShell({ children, acaoTopo, rotulo }: AuthShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-card" {...(rotulo === undefined ? {} : { 'aria-label': rotulo })}>
        <div className="auth-card__brand">
          <span className="app-sidebar__logo" aria-hidden="true">
            A
          </span>
          <strong>{BRAND.name}</strong>
          {acaoTopo === undefined ? null : <span className="auth-card__acao">{acaoTopo}</span>}
        </div>
        {children}
      </section>
    </main>
  );
}
