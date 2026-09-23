/** Formatação do portal. Dinheiro é sempre centavo inteiro, como no resto do sistema. */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const BRL_CENTAVOS = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Valor de anúncio: o portal mostra em reais cheios, como nas telas de
 * referência ("R$ 2.910/mês"). Centavo quebrado é arredondado para baixo só na
 * exibição — o valor guardado continua inteiro em centavos.
 */
export function formatarValor(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) {
    return '—';
  }
  return BRL.format(Math.trunc(centavos / 100));
}

/** Valor exato, com centavos, para quando a quebra importa. */
export function formatarValorExato(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) {
    return '—';
  }
  return BRL_CENTAVOS.format(centavos / 100);
}

export function formatarArea(metrosQuadrados: number | null | undefined): string {
  if (metrosQuadrados === null || metrosQuadrados === undefined) {
    return '—';
  }
  return `${new Intl.NumberFormat('pt-BR').format(metrosQuadrados)} m²`;
}

/** "1 quarto" / "2 quartos" — sem inventar número quando não há dado. */
export function plural(quantidade: number, singular: string, muitos: string): string {
  return `${String(quantidade)} ${quantidade === 1 ? singular : muitos}`;
}
