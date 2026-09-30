export interface OpcaoSegmentada {
  valor: string;
  rotulo: string;
  /** Opção que é página (finalidade da busca): vira link. */
  href?: string;
}

export interface SegmentadoProps {
  /** Rótulo do grupo para leitor de tela (ex.: "Finalidade"). */
  rotulo: string;
  opcoes: readonly OpcaoSegmentada[];
  valor: string;
  aoEscolher?: (valor: string) => void;
  /**
   * `preenchido` (padrão): a opção escolhida fica preta, como nos filtros, na gaveta e no canal do
   * alerta. `sublinhado`: filete de 2px embaixo, como as abas.
   */
  forma?: 'preenchido' | 'sublinhado';
  /** Altura das opções: 40 nos filtros do desktop, 44 na gaveta e no alerta. */
  altura?: 40 | 44;
}

/** Segmentado do portal (Alugar/Comprar, canal do alerta), sem caixa alta. */
export function Segmentado({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
  forma = 'preenchido',
  altura = 44,
}: SegmentadoProps) {
  return (
    <div
      className={`segmentado segmentado--${forma} segmentado--${String(altura)}`}
      role="group"
      aria-label={rotulo}
    >
      {opcoes.map((opcao) =>
        opcao.href !== undefined ? (
          <a
            key={opcao.valor}
            href={opcao.href}
            className="segmentado__opcao"
            aria-current={opcao.valor === valor ? 'page' : undefined}
          >
            {opcao.rotulo}
          </a>
        ) : (
          <button
            key={opcao.valor}
            type="button"
            className="segmentado__opcao"
            aria-pressed={opcao.valor === valor}
            onClick={
              aoEscolher
                ? () => {
                    aoEscolher(opcao.valor);
                  }
                : undefined
            }
          >
            {opcao.rotulo}
          </button>
        ),
      )}
    </div>
  );
}
