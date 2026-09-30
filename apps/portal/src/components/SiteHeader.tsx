'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Logotipo } from './Logotipo';
import type { CorLogotipo } from './Logotipo';
import { Gaveta } from './Gaveta';
import { urlCadastro, urlEntrar } from '@/lib/plataforma';

export interface SiteHeaderProps {
  /**
   * `consumidor` (padrão): Alugar, Comprar, Cidades e "Anunciar imóvel". `b2b`: as páginas para
   * imobiliárias, "Entrar" e "Começar". `logo`: só a marca (indisponível, vitrine e 404).
   */
  variante?: 'consumidor' | 'b2b' | 'logo';
  /** Cor da palavra "Imóvel" na seção atual. */
  cor?: CorLogotipo;
  /** Endereço do item da navegação que é a página atual (sublinhado de 2px). */
  ativo?: string;
  /** Só na variante `logo`: "Anunciar imóvel" à direita (indisponível e vitrine; o 404 não tem). */
  comAcao?: boolean;
  /** Celular: "←" no lugar do menu, de volta a este endereço (anúncio). */
  voltar?: string;
  /** Celular: o que vai à direita. O padrão é a lupa no consumidor e nada nas demais. */
  direitaCelular?: ReactNode;
}

// "Cidades" leva ao mapa do site, que é o índice de cidades com imóvel; `/cidades` não existe.
export const LINKS_CONSUMIDOR = [
  { href: '/alugar', rotulo: 'Alugar' },
  { href: '/comprar', rotulo: 'Comprar' },
  { href: '/mapa-do-site', rotulo: 'Cidades' },
];

export const LINKS_B2B = [
  { href: '/para-imobiliarias', rotulo: 'Para imobiliárias' },
  { href: '/anunciar', rotulo: 'Anunciar' },
  { href: '/gestao', rotulo: 'Gestão' },
  { href: '/planos', rotulo: 'Planos' },
];

function Lupa() {
  return (
    <a className="cabecalho__botao" href="/alugar" aria-label="Buscar imóveis">
      <span className="cabecalho__lupa" aria-hidden="true" />
    </a>
  );
}

/**
 * Cabeçalho do portal: 64px no desktop, 56px no celular com a grade
 * 44px · 1fr · 44px (alvos de toque). O menu do celular abre em gaveta cheia.
 */
export function SiteHeader({
  variante = 'consumidor',
  cor = 'acento',
  ativo,
  comAcao = false,
  voltar,
  direitaCelular,
}: SiteHeaderProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const links = variante === 'b2b' ? LINKS_B2B : variante === 'consumidor' ? LINKS_CONSUMIDOR : [];
  // No B2B as ações levam ao painel, que é outro host (ADR-100); no consumidor, à página de
  // anunciar do próprio portal.
  const anunciar = { href: '/anunciar', rotulo: 'Anunciar imóvel' };
  const direitaDoCelular =
    direitaCelular ?? (variante === 'consumidor' ? <Lupa /> : <span aria-hidden="true" />);

  return (
    <>
      <header className="cabecalho">
        <div className="cabecalho__mobile">
          {voltar ? (
            <a className="cabecalho__botao cabecalho__voltar" href={voltar} aria-label="Voltar">
              ←
            </a>
          ) : (
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
          )}
        </div>

        <div className="cabecalho__desktop">
          <Logotipo href="/" cor={cor} tamanho={21} />
          {links.length === 0 ? null : (
            <nav className="cabecalho__nav" aria-label="Seções do portal">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={link.href === ativo ? 'cabecalho__item--ativo' : undefined}
                  aria-current={link.href === ativo ? 'page' : undefined}
                >
                  {link.rotulo}
                </a>
              ))}
            </nav>
          )}
        </div>

        <div className="cabecalho__marca cabecalho__mobile">
          <Logotipo href="/" cor={cor} tamanho={19} />
        </div>

        <div className="cabecalho__mobile cabecalho__direita-celular">{direitaDoCelular}</div>

        {variante === 'b2b' ? (
          <div className="cabecalho__acoes">
            <a className="cabecalho__entrar" href={urlEntrar()}>
              Entrar
            </a>
            <a className="cabecalho__comecar" href={urlCadastro()}>
              Começar
            </a>
          </div>
        ) : variante === 'consumidor' || comAcao ? (
          <a className="cabecalho__acao" href={anunciar.href}>
            {anunciar.rotulo}
          </a>
        ) : null}
      </header>

      <Gaveta
        aberta={menuAberto}
        titulo="Menu"
        aoFechar={() => {
          setMenuAberto(false);
        }}
      >
        <nav className="menu-celular" aria-label="Seções do portal">
          {(variante === 'logo' ? LINKS_CONSUMIDOR : links).map((link) => (
            <a key={link.href} href={link.href}>
              {link.rotulo}
            </a>
          ))}
          {variante === 'b2b' ? (
            <>
              <a href={urlEntrar()}>Entrar</a>
              <a href={urlCadastro()}>Começar</a>
            </>
          ) : (
            <a href={anunciar.href}>{anunciar.rotulo}</a>
          )}
        </nav>
      </Gaveta>
    </>
  );
}
