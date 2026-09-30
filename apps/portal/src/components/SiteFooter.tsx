import { Logotipo } from './Logotipo';
import { appBaseUrl } from '@/lib/plataforma';

interface LinkDoRodape {
  href: string;
  rotulo: string;
  /** Caminho no painel, que é outro host (ADR-100): o endereço vem do ambiente ao renderizar. */
  painel?: boolean;
}

interface Coluna {
  titulo: string;
  links: LinkDoRodape[];
}

/*
 * Colunas e textos do rodapé da Home (telas/portal/01-home, linhas 128–131 e 188–194), só com os
 * links para páginas que existem (Onda 0 da rodada de fidelidade, defeito 6). Saíram, até as páginas
 * existirem: Conheça o AchouImóvel, Cidades atendidas, Central de ajuda, Valor do aluguel por
 * bairro, Criar alerta de imóvel (o alerta nasce na busca), "Como funciona →" e os links legais —
 * Termos de uso e Política de privacidade dependem do texto do dono (`docs/BLOCKERS.md`).
 */
export const COLUNAS: Coluna[] = [
  {
    titulo: 'Sobre o AchouImóvel',
    links: [{ href: '/mapa-do-site', rotulo: 'Mapa do site' }],
  },
  {
    titulo: 'Procurar',
    links: [
      { href: '/alugar', rotulo: 'Imóveis para alugar' },
      { href: '/comprar', rotulo: 'Imóveis à venda' },
    ],
  },
  {
    titulo: 'Anunciar',
    links: [
      { href: '/anunciar', rotulo: 'Anunciar imóvel' },
      { href: '/planos', rotulo: 'Planos' },
      { href: '/login', rotulo: 'Entrar', painel: true },
    ],
  },
];

export const LEGAIS: { href: string; rotulo: string }[] = [];

/** Redes sociais: pendência do dono; sem endereço, a linha some. */
export const REDES: { href: string; rotulo: string }[] = [];

export interface SiteFooterProps {
  /** Razão social e CNPJ do rodapé. Pendência do dono: sem o dado, a linha some. */
  razaoSocial?: string | null;
  cnpj?: string | null;
  /** Data da versão publicada ("Versão: 22/09/2026"). */
  versao?: string | null;
}

function hrefDe(link: LinkDoRodape): string {
  return link.painel === true ? `${appBaseUrl()}${link.href}` : link.href;
}

/**
 * Rodapé do portal: três colunas de links e o bloco da marca em verde com grade. No celular o
 * bloco vem primeiro e as colunas viram acordeão.
 */
export function SiteFooter({ razaoSocial, cnpj, versao }: SiteFooterProps) {
  const empresa =
    razaoSocial || cnpj ? (
      <span className="rodape__razao">
        {razaoSocial ? <b>{razaoSocial}</b> : null}
        {razaoSocial && cnpj ? ' ' : null}
        {cnpj ? `CNPJ ${cnpj}` : null}
      </span>
    ) : null;

  return (
    <footer className="rodape">
      <div className="rodape__colunas">
        <div className="rodape__marca">
          <Logotipo cor="branco" tamanho={22} />
          <p className="rodape__marca-texto">
            Todo anúncio mostra o valor total do mês e traz o CRECI de quem anuncia. O endereço
            exato você recebe no contato.
          </p>
        </div>

        {COLUNAS.map((coluna) => (
          <div className="rodape__coluna" key={coluna.titulo}>
            <span className="rodape__titulo">{coluna.titulo}</span>
            {coluna.links.map((link) => (
              <a className="rodape__link" href={hrefDe(link)} key={link.href}>
                {link.rotulo}
              </a>
            ))}
          </div>
        ))}

        <div className="rodape__acordeao">
          {COLUNAS.map((coluna) => (
            <details className="rodape__grupo" key={coluna.titulo}>
              <summary className="rodape__grupo-titulo">
                {coluna.titulo}
                <span className="rodape__grupo-sinal" aria-hidden="true" />
              </summary>
              <div className="rodape__grupo-links">
                {coluna.links.map((link) => (
                  <a className="rodape__link" href={hrefDe(link)} key={link.href}>
                    {link.rotulo}
                  </a>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      {LEGAIS.length === 0 && REDES.length === 0 ? null : (
        <div className="rodape__linha">
          <div className="rodape__legais">
            {LEGAIS.map((link) => (
              <a className="rodape__legal" href={link.href} key={link.href}>
                {link.rotulo} →
              </a>
            ))}
          </div>
          <div className="rodape__redes">
            {REDES.map((link) => (
              <a className="rodape__rede" href={link.href} key={link.href}>
                {link.rotulo}
              </a>
            ))}
          </div>
        </div>
      )}

      {empresa || versao ? (
        <div className="rodape__empresa">
          {empresa}
          {versao ? <span className="rodape__versao">Versão: {versao}</span> : null}
        </div>
      ) : null}
    </footer>
  );
}
