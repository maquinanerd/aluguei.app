import { Badge, type BadgeTone } from './Badge';

/**
 * StatusBadge: mapa status → tom semântico. Componentes de domínio usam este
 * componente com seus próprios mapas; aqui ficam os defaults neutros.
 */
export function StatusBadge({
  label,
  tone = 'neutral',
  title,
}: {
  label: string;
  tone?: BadgeTone;
  title?: string;
}) {
  const props = title ? { title } : {};
  return (
    <Badge tone={tone} {...props}>
      {label}
    </Badge>
  );
}
