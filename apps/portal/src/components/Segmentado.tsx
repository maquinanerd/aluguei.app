export interface OpcaoSegmentada {
  valor: string;
  rotulo: string;
}

export interface SegmentadoProps {
  /** Rótulo do grupo para leitor de tela (ex.: "Finalidade"). */
  rotulo: string;
  opcoes: readonly OpcaoSegmentada[];
  valor: string;
  aoEscolher?: (valor: string) => void;
}

/**
 * Segmentado do portal (Alugar/Comprar, finalidade na vitrine): filete de 2px
 * embaixo da opção escolhida, sem caixa alta.
 */
export function Segmentado({ rotulo, opcoes, valor, aoEscolher }: SegmentadoProps) {
  return (
    <div className="segmentado" role="group" aria-label={rotulo}>
      {opcoes.map((opcao) => (
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
      ))}
    </div>
  );
}
