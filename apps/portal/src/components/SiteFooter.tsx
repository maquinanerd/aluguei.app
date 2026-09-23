import { BlocoGrade } from './BlocoGrade';
import { Logotipo } from './Logotipo';

interface Coluna {
  titulo: string;
  links: { href: string; rotulo: string }[];
}

const COLUNAS: Coluna[] = [
  {
    titulo: 'Sobre o AchouImóvel',
    links: [
      { href: '/sobre', rotulo: 'Conheça o AchouImóvel' },
      { href: '/cidades', rotulo: 'Cidades atendidas' },
      { href: '/ajuda', rotulo: 'Central de ajuda' },
      { href: '/mapa-do-site', rotulo: 'Mapa do site' },
    ],
  },
  {
    titulo: 'Procurar',
    links: [
      { href: '/alugar', rotulo: 'Imóveis para alugar' },
      { href: '/comprar', rotulo: 'Imóveis à venda' },
      { href: '/alerta', rotulo: 'Criar alerta de imóvel' },
    ],
  },
  {
    titulo: 'Anunciar',
    links: [
      { href: '/para-imobiliarias/anunciar', rotulo: 'Anunciar imóvel' },
      { href: '/planos', rotulo: 'Planos' },
      { href: '/login', rotulo: 'Entrar' },
    ],
  },
];

const LEGAIS = [
  { href: '/termos', rotulo: 'Termos de uso' },
  { href: '/privacidade', rotulo: 'Política de privacidade' },
  { href: '/cookies', rotulo: 'Política de cookies' },
];

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
              <a className="rodape__link" href={link.href} key={link.href}>
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

      <div className="rodape__legais">
        {LEGAIS.map((link) => (
          <a className="rodape__legal" href={link.href} key={link.href}>
            {link.rotulo} →
          </a>
        ))}
      </div>

      {(razaoSocial ?? cnpj ?? versao) ? (
        <span className="rodape__razao">
          {[razaoSocial, cnpj ? `CNPJ ${cnpj}` : null, versao].filter(Boolean).join(' · ')}
        </span>
      ) : null}
    </footer>
  );
}
