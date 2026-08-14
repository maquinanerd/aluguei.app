import { cx } from '../lib/cx';
import { Icon, type IconName } from './icons';
import { Button } from './Button';

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  icon = 'inbox',
  className,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={cx('peg-empty', className)}>
      <Icon name={icon} size={32} />
      <span className="peg-empty__title">{title}</span>
      {body ? <span className="peg-empty__body">{body}</span> : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = 'Não foi possível carregar',
  body,
  onRetry,
  className,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cx('peg-error', className)} role="alert">
      <Icon name="alertCircle" size={28} />
      <span className="peg-error__title">{title}</span>
      {body ? <span className="peg-error__body">{body}</span> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function PermissionDenied({
  title = 'Sem permissão',
  body = 'Sua função atual não permite acessar este conteúdo.',
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="peg-error" role="alert">
      <Icon name="shield" size={28} />
      <span className="peg-error__title">{title}</span>
      <span className="peg-error__body">{body}</span>
    </div>
  );
}

export function DisconnectedIntegration({
  name,
  onReconnect,
}: {
  name: string;
  onReconnect?: () => void;
}) {
  return (
    <div className="peg-empty">
      <Icon name="unlock" size={28} />
      <span className="peg-empty__title">Integração desconectada</span>
      <span className="peg-empty__body">
        {name} não está conectada. Reconecte para sincronizar os dados.
      </span>
      {onReconnect ? (
        <Button variant="secondary" size="sm" onClick={onReconnect}>
          Conectar
        </Button>
      ) : null}
    </div>
  );
}
