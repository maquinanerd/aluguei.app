import { BlocoGrade } from './BlocoGrade';
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
 * Só links para páginas que existem (Onda 0 da rodada de fidelidade, defeito 6). Saíram, até as
 * páginas existirem: Conheça o AchouImóvel, Central de ajuda, Criar alerta (o alerta nasce na
 * busca) e os links legais — Termos de uso e Política de privacidade dependem do texto do dono
 * (`docs/BLOCKERS.md`).
 */
export const COLUNAS: Coluna[] = [
  {
    titulo: 'Sobre o AchouImóvel',
    links: [{ href: '/mapa-do-site', rotulo: 'Cidades e bairros' }],
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

export interface SiteFooterProps {
  /** Razão social e CNPJ do rodapé. Pendência do dono: sem o dado, a linha some. */
  razaoSocial?: string | null;
  cnpj?: string | null;
  versao?: string | null;
}

/** Rodapé do portal: três colunas de links e o bloco da marca em verde com grade. */
export function SiteFooter({ razaoSocial, cnpj, versao }: SiteFooterProps) {
  return (
    <footer className="rodape">
      <div className="rodape__colunas">
        {COLUNAS.map((coluna) => (
          <div className="rodape__coluna" key={coluna.titulo}>
            <span className="rodape__titulo">{coluna.titulo}</span>
            {coluna.links.map((link) => (
              <a
                className="rodape__link"
                href={link.painel === true ? `${appBaseUrl()}${link.href}` : link.href}
                key={link.href}
              >
                {link.rotulo}
              </a>
            ))}
          </div>
        ))}

        <BlocoGrade cor="acento" grade="desktop">
          <Logotipo cor="branco" tamanho="lg" />
          <p style={{ margin: 0, fontSize: '14.5px', lineHeight: 1.65 }}>
            Todo anúncio mostra o valor total do mês e traz o CRECI de quem anuncia. O endereço
            exato você recebe no contato.
          </p>
        </BlocoGrade>
      </div>

      {LEGAIS.length === 0 ? null : (
        <div className="rodape__legais">
          {LEGAIS.map((link) => (
            <a className="rodape__legal" href={link.href} key={link.href}>
              {link.rotulo} →
            </a>
          ))}
        </div>
      )}

      {(razaoSocial ?? cnpj ?? versao) ? (
        <span className="rodape__razao">
          {[razaoSocial, cnpj ? `CNPJ ${cnpj}` : null, versao].filter(Boolean).join(' · ')}
        </span>
      ) : null}
    </footer>
  );
}
