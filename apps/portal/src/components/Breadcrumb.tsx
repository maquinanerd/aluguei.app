export interface Trilho {
  rotulo: string;
  /** Sem href é a página atual (último trilho). */
  href?: string;
}

export interface BreadcrumbProps {
  trilhos: readonly Trilho[];
  /**
   * `faixa`: branca, dentro da faixa colorida da busca; no celular some o último nível, como na
   * tela. `pagina` (padrão): cinza, acima do anúncio.
   */
  variante?: 'faixa' | 'pagina';
}

/** Trilha da busca e do anúncio, com "›" entre os níveis. O último item não é link. */
export function Breadcrumb({ trilhos, variante = 'pagina' }: BreadcrumbProps) {
  return (
    <nav className={`trilha trilha--${variante}`} aria-label="Trilha de navegação">
      {trilhos.map((trilho, indice) => (
        <span className="trilha__nivel" key={`${String(indice)}-${trilho.rotulo}`}>
          {indice > 0 ? (
            <span className="trilha__separador" aria-hidden="true">
              ›
            </span>
          ) : null}
          {trilho.href ? (
            <a href={trilho.href}>{trilho.rotulo}</a>
          ) : (
            <span aria-current="page">{trilho.rotulo}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
