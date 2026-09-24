'use client';

import { useState } from 'react';
import { Logotipo } from './Logotipo';
import type { CorLogotipo } from './Logotipo';
import { Gaveta } from './Gaveta';
import { urlEntrar } from '@/lib/plataforma';

export interface SiteHeaderProps {
  /** `consumidor` é o padrão; `b2b` troca os links por Entrar e Começar. */
  variante?: 'consumidor' | 'b2b';
  /** Cor da palavra "Imóvel" na seção atual. */
  cor?: CorLogotipo;
}

const LINKS_CONSUMIDOR = [
  { href: '/alugar', rotulo: 'Alugar' },
  { href: '/comprar', rotulo: 'Comprar' },
  { href: '/cidades', rotulo: 'Cidades' },
];

const LINKS_B2B = [
  { href: '/para-imobiliarias', rotulo: 'Para imobiliárias' },
  { href: '/anunciar', rotulo: 'Anunciar' },
  { href: '/gestao', rotulo: 'Gestão' },
  { href: '/planos', rotulo: 'Planos' },
];

/**
 * Cabeçalho do portal: 64px no desktop, 56px no celular com a grade
 * 44px · 1fr · 44px (alvos de toque). O menu do celular abre em gaveta cheia.
 */
export function SiteHeader({ variante = 'consumidor', cor = 'acento' }: SiteHeaderProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const links = variante === 'b2b' ? LINKS_B2B : LINKS_CONSUMIDOR;
  // No B2B a ação leva ao painel, que é outro host (ADR-100); no consumidor,
  // leva à página de anunciar do próprio portal.
  const acao =
    variante === 'b2b'
      ? { href: urlEntrar(), rotulo: 'Entrar' }
      : { href: '/anunciar', rotulo: 'Anunciar imóvel' };

  return (
    <>
      <header className="cabecalho">
        <div className="cabecalho__mobile">
          <button
            type="button"
            className="cabecalho__botao"
            aria-label="Abrir menu"
            aria-expanded={menuAberto}
            onClick={() => {
              setMenuAberto(true);
            }}
          >
            <span className="cabecalho__hamburguer" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>

        <div className="cabecalho__desktop">
          <Logotipo href="/" cor={cor} tamanho="md" />
          <nav className="cabecalho__nav" aria-label="Seções do portal">
            {links.map((link) => (
              <a key={link.href} href={link.href}>
                {link.rotulo}
              </a>
            ))}
          </nav>
        </div>

        <div className="cabecalho__marca cabecalho__mobile">
          <Logotipo href="/" cor={cor} tamanho="sm" />
        </div>

        <a className="cabecalho__acao" href={acao.href}>
          {acao.rotulo}
        </a>
      </header>

      <Gaveta
        aberta={menuAberto}
        titulo="Menu"
        aoFechar={() => {
          setMenuAberto(false);
        }}
      >
        <nav
          className="cabecalho__nav"
          aria-label="Seções do portal"
          style={{ flexDirection: 'column', gap: 18 }}
        >
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.rotulo}
            </a>
          ))}
          <a href={acao.href}>{acao.rotulo}</a>
        </nav>
      </Gaveta>
    </>
  );
}
