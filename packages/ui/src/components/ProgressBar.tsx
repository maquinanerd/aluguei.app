import { cx } from '../lib/cx';

/**
 * Tom do preenchimento (spec da Onda 1C, §7.1): marca (`#41945D`, ciclo de locação), neutro
 * (`#6E746B`, demanda por bairro), aviso e perigo (uso perto do limite e estourado) e apagado
 * (`#E6E6E3`, "sem limite").
 */
export type ProgressTone = 'brand' | 'neutral' | 'warning' | 'danger' | 'muted';

export interface ProgressBarProps {
  /** De 0 a 100; fora disso, fica no limite. */
  value: number;
  /**
   * Nome lido pelo leitor de tela: "Contratos ativos: 96 de 100". Sem ele a barra é decorativa (o
   * número já está escrito ao lado, como no ciclo de locação) e fica fora da árvore de acessibilidade.
   */
  label?: string;
  tone?: ProgressTone;
  /** `sm`: trilho de 4px (player de áudio); o padrão é 6px. */
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * Barra de progresso dos desenhos: trilho `#F0F0F0` de 6px com raio 3 e preenchimento na largura do
 * valor (`01-painel.dc.html:59`, `:64`; `03-ajustes.dc.html:52`, `:103`; `04-cadastro-por-voz.dc.html:70`).
 * No tom `danger` o trilho também fica vermelho claro, como a barra estourada do limite de contratos.
 */
export function ProgressBar({
  value,
  label,
  tone = 'brand',
  size = 'md',
  className,
}: ProgressBarProps) {
  const valor = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const leitura =
    label === undefined
      ? { 'aria-hidden': true }
      : {
          role: 'progressbar',
          'aria-label': label,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': Math.round(valor),
        };
  return (
    <span
      className={cx(
        'peg-progress',
        `peg-progress--${tone}`,
        size === 'sm' && 'peg-progress--sm',
        className,
      )}
      {...leitura}
    >
      <span className="peg-progress__fill" style={{ width: `${String(valor)}%` }} />
    </span>
  );
}
