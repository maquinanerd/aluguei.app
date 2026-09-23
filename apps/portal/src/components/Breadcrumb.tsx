export interface Trilho {
  rotulo: string;
  /** Sem href é a página atual (último trilho). */
  href?: string;
}

export interface BreadcrumbProps {
  trilhos: readonly Trilho[];
}

/** Trilha da busca e do anúncio. O último item não é link. */
export function Breadcrumb({ trilhos }: BreadcrumbProps) {
  return (
    <nav className="trilha" aria-label="Trilha de navegação">
      {trilhos.map((trilho, indice) => (
        <span key={trilho.rotulo}>
          {indice > 0 ? (
            <span className="trilha__separador" aria-hidden="true">
              {' · '}
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
