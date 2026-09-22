'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Icon,
  Input,
  Modal,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { BadgeTone, IconName } from '@aluguei/ui';
import { formatDate, formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied } from '@aluguei/ui';
import {
  WHATSAPP_CONNECTION_STATUS_LABELS,
  claimExpired,
  connectWhatsAppErrors,
  fakeOwnerTokenHint,
  whatsappConnectionActions,
} from '@/lib/whatsapp-connection-rules';
import type { FieldErrors } from '@/lib/account-rules';

interface Connection {
  id: string;
  status: string;
  scopes: string[];
  lastTestedAt: string | null;
  createdAt: string;
}

interface WaConnection {
  id: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  status: string;
  claimExpiresAt: string | null;
  verifiedAt: string | null;
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  createdAt: string;
}

type WaVerifier = 'FAKE' | 'META' | null;

const CONN_LABELS: Record<string, string> = {
  CONNECTING: 'Conectando',
  ACTIVE: 'Ativa',
  EXPIRED: 'Expirada',
  REVOKED: 'Revogada',
};

const WA_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  DISABLED: 'neutral',
};

interface IntegrationDef {
  key: string;
  name: string;
  description: string;
  icon: IconName;
  provider: 'meta' | 'whatsapp' | 'geocoding' | 'screening' | 'signature' | 'payments';
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'meta',
    name: 'Meta Ads',
    description: 'Campanhas de anúncios para imóveis (Housing).',
    icon: 'megaphone',
    provider: 'meta',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Conversas e envio de mensagens.',
    icon: 'whatsapp',
    provider: 'whatsapp',
  },
  {
    key: 'geocoding',
    name: 'Google Maps',
    description: 'Geocodificação de endereços.',
    icon: 'mapPin',
    provider: 'geocoding',
  },
  {
    key: 'screening',
    name: 'Análise de crédito',
    description: 'Screening Serasa/SPC via adapter.',
    icon: 'shield',
    provider: 'screening',
  },
  {
    key: 'signature',
    name: 'Assinatura eletrônica',
    description: 'Envelopes Clicksign/D4Sign.',
    icon: 'gavel',
    provider: 'signature',
  },
  {
    key: 'payments',
    name: 'Pagamentos',
    description: 'Pix/boleto via gateway (Asaas).',
    icon: 'creditCard',
    provider: 'payments',
  },
];

function IntegrationsBody() {
  const toast = useToast();
  const metaQ = useQuery<{ connections: Connection[] }>('/meta/connections', []);
  const waQ = useQuery<{ connections: WaConnection[]; verifier: WaVerifier }>(
    '/whatsapp/connections',
    [],
  );

  if (metaQ.permissionDenied) return <PermissionDenied title="Sem acesso às integrações" />;

  const metaConn = metaQ.data?.connections[0] ?? null;
  const waConn = waQ.data?.connections[0] ?? null;

  async function reconnectMeta() {
    try {
      await apiClient('/meta/connections', { method: 'POST', body: { provider: 'FAKE' } });
      toast.success('Meta reconectada (teste)');
      metaQ.reload();
    } catch (err) {
      toast.error('Falha ao conectar', err instanceof Error ? err.message : undefined);
    }
  }

  function statusOf(def: IntegrationDef): { connected: boolean; label: string; detail?: string } {
    if (def.provider === 'meta') {
      if (!metaConn) return { connected: false, label: 'Desconectada' };
      const st: { connected: boolean; label: string; detail?: string } = {
        connected: metaConn.status === 'ACTIVE',
        label: CONN_LABELS[metaConn.status] ?? metaConn.status,
      };
      if (metaConn.lastTestedAt) st.detail = `último teste ${formatDate(metaConn.lastTestedAt)}`;
      return st;
    }
    // Adapters com mock implícito (sem estado de conexão exposto): reportado como
    // "mock/dry-run" quando sem credencial externa (IMPLEMENTED_NOT_LIVE_VERIFIED).
    return {
      connected: false,
      label: 'Mock / dry-run',
      detail: 'Sem credencial externa — adapter implementado, não verificado ao vivo.',
    };
  }

  return (
    <div className="app-page">
      <PageToolbar title="Integrações" description="Status das conexões externas da operação." />

      <div className="peg-grid cols-2">
        {INTEGRATIONS.map((def) => {
          if (def.provider === 'whatsapp') {
            return (
              <WhatsAppCard
                key={def.key}
                def={def}
                connection={waConn}
                verifier={waQ.data?.verifier ?? null}
                loading={waQ.loading}
                onChanged={waQ.reload}
              />
            );
          }
          const st = statusOf(def);
          return (
            <Card key={def.key} title={def.name} padless>
              <Stack gap={3} style={{ padding: 20 }}>
                <Group gap={3}>
                  <Icon name={def.icon} size={22} />
                  <Stack gap={0} style={{ flex: 1 }}>
                    <span style={{ fontSize: 13 }}>{def.description}</span>
                    {st.detail ? (
                      <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                        {st.detail}
                      </span>
                    ) : null}
                  </Stack>
                </Group>
                <Group between>
                  <Badge tone={st.connected ? 'success' : 'neutral'}>{st.label}</Badge>
                  {def.provider === 'meta' ? (
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={<Icon name="refresh" size={12} />}
                      onClick={() => {
                        void reconnectMeta();
                      }}
                    >
                      Conectar (teste)
                    </Button>
                  ) : null}
                </Group>
                <p className="peg-text-tertiary" style={{ fontSize: 11 }}>
                  Secrets nunca são exibidos. Estado real depende de credencial/homologação.
                </p>
              </Stack>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * WhatsApp com prova de posse do número (auditoria 2026-09-10, P1-18, segunda parte): a
 * imobiliária informa o ID do número e o token da própria conta do WhatsApp Business; a conexão
 * fica aguardando verificação (sem receber mensagens) até o número ser conferido com esse token.
 */
function WhatsAppCard({
  def,
  connection,
  verifier,
  loading,
  onChanged,
}: {
  def: IntegrationDef;
  connection: WaConnection | null;
  verifier: WaVerifier;
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [dialog, setDialog] = useState<'connect' | 'replace' | null>(null);
  const [verifying, setVerifying] = useState(false);
  const actions = whatsappConnectionActions(connection);
  const expired = connection
    ? claimExpired(connection.status, connection.claimExpiresAt, new Date())
    : false;

  async function verify() {
    if (!connection) return;
    setVerifying(true);
    try {
      await apiClient(`/whatsapp/connections/${connection.id}/verify`, {
        method: 'POST',
        body: {},
      });
      toast.success('Posse do número verificada', 'As mensagens do número chegam a esta conta.');
    } catch (err) {
      toast.error('Falha na verificação', err instanceof Error ? err.message : undefined);
    } finally {
      setVerifying(false);
      onChanged();
    }
  }

  const lines: string[] = [];
  if (connection) {
    if (connection.status === 'VERIFIED') {
      lines.push(
        [connection.displayPhoneNumber ?? `ID ${connection.phoneNumberId}`, connection.verifiedName]
          .filter(Boolean)
          .join(' · '),
      );
      lines.push(`Recebe mensagens desde ${formatDateTime(connection.verifiedAt)}`);
    } else {
      lines.push(`ID do número ${connection.phoneNumberId}`);
      if (connection.status === 'PENDING') {
        lines.push(
          expired
            ? 'Reivindicação vencida: outra imobiliária que provar a posse pode ficar com o número. Verifique agora.'
            : `Reivindicação válida até ${formatDateTime(connection.claimExpiresAt)}`,
        );
      }
      lines.push('Ainda não recebe mensagens: falta comprovar a posse do número.');
    }
  }

  return (
    <Card title={def.name} padless>
      <Stack gap={3} style={{ padding: 20 }}>
        <Group gap={3}>
          <Icon name={def.icon} size={22} />
          <Stack gap={0} style={{ flex: 1 }}>
            <span style={{ fontSize: 13 }}>{def.description}</span>
            {lines.map((line) => (
              <span key={line} className="peg-text-tertiary" style={{ fontSize: 12 }}>
                {line}
              </span>
            ))}
          </Stack>
        </Group>
        <Group between wrap>
          {connection ? (
            <Badge tone={WA_TONES[connection.status] ?? 'neutral'}>
              {WHATSAPP_CONNECTION_STATUS_LABELS[connection.status] ?? connection.status}
            </Badge>
          ) : (
            <Badge tone="neutral">{loading ? 'Carregando…' : 'Desconectada'}</Badge>
          )}
          <Group gap={2}>
            {actions.connect && !loading ? (
              <Button
                size="xs"
                variant="secondary"
                icon={<Icon name="plus" size={12} />}
                onClick={() => {
                  setDialog('connect');
                }}
              >
                Conectar número
              </Button>
            ) : null}
            {actions.replaceToken ? (
              <Button
                size="xs"
                variant="tertiary"
                onClick={() => {
                  setDialog('replace');
                }}
              >
                Trocar token
              </Button>
            ) : null}
            {actions.verify ? (
              <Button
                size="xs"
                variant="primary"
                icon={<Icon name="shield" size={12} />}
                loading={verifying}
                onClick={() => {
                  void verify();
                }}
              >
                Verificar posse
              </Button>
            ) : null}
          </Group>
        </Group>
        <p className="peg-text-tertiary" style={{ fontSize: 11 }}>
          O token fica cifrado no servidor e nunca é exibido. Só o número verificado recebe as
          mensagens do webhook.
        </p>
      </Stack>
      {dialog ? (
        <WhatsAppConnectModal
          mode={dialog}
          connection={connection}
          verifier={verifier}
          onClose={() => {
            setDialog(null);
          }}
          onDone={(message) => {
            toast.success(message, 'Falta verificar a posse com o token informado.');
            setDialog(null);
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

function WhatsAppConnectModal({
  mode,
  connection,
  verifier,
  onClose,
  onDone,
}: {
  mode: 'connect' | 'replace';
  connection: WaConnection | null;
  verifier: WaVerifier;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const replacing = mode === 'replace' && connection !== null;
  const [phoneNumberId, setPhoneNumberId] = useState(connection?.phoneNumberId ?? '');
  const [businessAccountId, setBusinessAccountId] = useState(connection?.businessAccountId ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [errors, setErrors] = useState<
    FieldErrors<'phoneNumberId' | 'businessAccountId' | 'accessToken'>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setServerError(null);
    const found = connectWhatsAppErrors({ phoneNumberId, businessAccountId, accessToken });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const body: { phoneNumberId: string; accessToken: string; businessAccountId?: string } = {
        phoneNumberId: phoneNumberId.trim(),
        accessToken: accessToken.trim(),
      };
      if (businessAccountId.trim()) body.businessAccountId = businessAccountId.trim();
      await apiClient('/whatsapp/connections', { method: 'POST', body });
      onDone(replacing ? 'Token atualizado' : 'Número registrado');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Falha ao registrar o número');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={replacing ? 'Trocar token do número' : 'Conectar número do WhatsApp'}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="whatsapp-connect-form" loading={busy}>
            {replacing ? 'Salvar token' : 'Registrar número'}
          </Button>
        </>
      }
    >
      <form
        id="whatsapp-connect-form"
        className="peg-stack"
        style={{ gap: 16 }}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        {serverError ? (
          <span className="peg-field__error" role="alert">
            {serverError}
          </span>
        ) : null}
        <Input
          label="ID do número (phone_number_id)"
          inputMode="numeric"
          required
          disabled={replacing}
          value={phoneNumberId}
          onChange={(e) => {
            setPhoneNumberId(e.target.value);
          }}
          helper="No gerenciador do WhatsApp Business, em Números de telefone."
          {...(errors.phoneNumberId ? { error: errors.phoneNumberId } : {})}
        />
        <Input
          label="ID da conta do WhatsApp Business"
          optional
          inputMode="numeric"
          value={businessAccountId}
          onChange={(e) => {
            setBusinessAccountId(e.target.value);
          }}
          {...(errors.businessAccountId ? { error: errors.businessAccountId } : {})}
        />
        <Input
          label="Token de acesso da conta"
          type="password"
          autoComplete="off"
          required
          value={accessToken}
          onChange={(e) => {
            setAccessToken(e.target.value);
          }}
          helper="Token da conta do WhatsApp Business desta imobiliária (usuário do sistema)."
          {...(errors.accessToken ? { error: errors.accessToken } : {})}
        />
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          O número fica pendente por 24 horas e não recebe mensagens até a posse ser comprovada com
          este token. Número já verificado em outra conta não pode ser registrado.
        </span>
        {verifier === 'FAKE' ? (
          <span className="peg-text-secondary" style={{ fontSize: 12 }}>
            {`Ambiente de teste: a verificação é simulada, sem chamada à Meta. O token ${fakeOwnerTokenHint(phoneNumberId)} é o dono do número.`}
          </span>
        ) : null}
        {verifier === null ? (
          <span className="peg-field__error">
            WhatsApp não configurado neste ambiente: o número pode ser registrado, mas não
            verificado.
          </span>
        ) : null}
      </form>
    </Modal>
  );
}

export function IntegrationsClient() {
  return (
    <ToastProvider>
      <IntegrationsBody />
    </ToastProvider>
  );
}
