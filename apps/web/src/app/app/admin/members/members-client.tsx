'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmModal,
  DataTable,
  Dropdown,
  Group,
  Icon,
  Input,
  Modal,
  Select,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { BadgeTone, Column } from '@aluguei/ui';
import { formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, ROLE_LABELS } from '@/lib/labels';
import { INVITE_STATUS_LABELS, inviteErrors } from '@/lib/account-rules';
import type { FieldErrors } from '@/lib/account-rules';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface OutboxMessage {
  id: string;
  kind: string;
  toEmail: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
}

const INVITE_STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REVOKED: 'neutral',
  EXPIRED: 'neutral',
};

const OUTBOX_STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Na fila (não enviado)',
  SENT: 'Enviado',
  FAILED: 'Falhou',
};

function MembersBody({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);

  const membersPath = `/organizations/${orgId}/members`;
  const orgMembers = useQuery<{ members: Member[] }>(membersPath, [orgId]);
  const invitesQ = useQuery<{ invites: Invite[] }>(`/organizations/${orgId}/invites`, [orgId]);
  // Caixa de saída local: só quem tem `org:manage` lê (403 para as demais funções).
  const outboxQ = useQuery<{ messages: OutboxMessage[] }>('/email-outbox', [orgId]);

  const members = useMemo(() => {
    const rows = orgMembers.data?.members ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [orgMembers.data, search]);

  if (orgMembers.permissionDenied) {
    return <PermissionDenied title="Sem acesso à equipe" />;
  }

  async function updateRole(member: Member, role: string) {
    try {
      await apiClient(`/organizations/${orgId}/members/${member.userId}`, {
        method: 'PATCH',
        body: { role },
      });
      toast.success('Função atualizada', label(ROLE_LABELS, role));
      orgMembers.reload();
    } catch (err) {
      toast.error('Falha ao atualizar', err instanceof Error ? err.message : undefined);
    }
  }

  async function remove(member: Member) {
    try {
      await apiClient(`/organizations/${orgId}/members/${member.userId}`, { method: 'DELETE' });
      toast.success('Membro removido');
      orgMembers.reload();
    } catch (err) {
      toast.error('Falha ao remover', err instanceof Error ? err.message : undefined);
    }
  }

  async function revoke(invite: Invite) {
    setBusy(true);
    try {
      await apiClient(`/organizations/${orgId}/invites/${invite.id}`, { method: 'DELETE' });
      toast.success('Convite revogado');
      setRevoking(null);
      invitesQ.reload();
    } catch (err) {
      toast.error('Falha ao revogar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: 'Membro',
      render: (m) => (
        <Group gap={2}>
          <Avatar name={m.name} size="sm" />
          <Stack gap={0}>
            <span style={{ fontWeight: 500 }}>{m.name}</span>
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              {m.email}
            </span>
          </Stack>
        </Group>
      ),
    },
    {
      key: 'role',
      header: 'Função',
      render: (m) => (
        <Badge tone={m.role === 'owner' || m.role === 'admin' ? 'brand' : 'neutral'}>
          {label(ROLE_LABELS, m.role)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (m) => (
        <Dropdown
          ariaLabel={`Ações de ${m.name}`}
          trigger={
            <Button variant="tertiary" size="xs">
              <Icon name="moreVertical" size={14} />
            </Button>
          }
          items={[
            ...Object.keys(ROLE_LABELS)
              .filter((r) => r !== m.role)
              .map((r) => ({
                key: r,
                label: `Tornar ${label(ROLE_LABELS, r)}`,
                onSelect: () => {
                  void updateRole(m, r);
                },
              })),
            {
              key: 'remove',
              label: 'Remover da equipe',
              icon: 'trash',
              danger: true,
              onSelect: () => {
                void remove(m);
              },
            },
          ]}
        />
      ),
    },
  ];

  const inviteColumns: Column<Invite>[] = [
    {
      key: 'email',
      header: 'E-mail',
      render: (i) => <span style={{ fontWeight: 500 }}>{i.email}</span>,
    },
    {
      key: 'role',
      header: 'Função',
      render: (i) => <span className="peg-text-secondary">{label(ROLE_LABELS, i.role)}</span>,
    },
    {
      key: 'status',
      header: 'Situação',
      render: (i) => (
        <Badge tone={INVITE_STATUS_TONES[i.status] ?? 'neutral'}>
          {label(INVITE_STATUS_LABELS, i.status)}
        </Badge>
      ),
    },
    {
      key: 'expires',
      header: 'Válido até',
      render: (i) => <span className="peg-text-tertiary">{formatDateTime(i.expiresAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (i) =>
        i.status === 'PENDING' ? (
          <Button
            variant="tertiary"
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              setRevoking(i);
            }}
          >
            Revogar
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Usuários e equipe"
        description="Membros da organização e suas funções."
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar membro…' }}
        actions={
          <Button
            variant="brand"
            size="sm"
            icon={<Icon name="plus" size={14} />}
            onClick={() => {
              setInviteOpen(true);
            }}
          >
            Convidar membro
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={members}
        loading={orgMembers.loading}
        emptyTitle="Nenhum membro"
        emptyBody="Convide membros para trabalhar em conjunto."
        emptyActionLabel="Convidar membro"
        onEmptyAction={() => {
          setInviteOpen(true);
        }}
      />
      {orgMembers.error ? <ErrorState body={orgMembers.error} onRetry={orgMembers.reload} /> : null}

      <Card title="Convites" padless>
        <DataTable
          columns={inviteColumns}
          rows={invitesQ.data?.invites ?? []}
          loading={invitesQ.loading}
          emptyTitle="Nenhum convite"
          emptyBody="Convites por e-mail aparecem aqui até serem aceitos, revogados ou expirarem."
        />
      </Card>

      {outboxQ.permissionDenied ? null : (
        <Card title="Caixa de saída" padless>
          <Stack gap={2} style={{ padding: 16 }}>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              Mensagens registradas neste ambiente — nenhum e-mail é enviado. Para convidar alguém,
              copie o link da mensagem e entregue à pessoa.
            </span>
            {(outboxQ.data?.messages ?? []).length === 0 ? (
              <span className="peg-text-tertiary" style={{ fontSize: 13 }}>
                Nenhuma mensagem registrada.
              </span>
            ) : (
              (outboxQ.data?.messages ?? []).map((message) => (
                <details
                  key={message.id}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid var(--peg-border)',
                    borderRadius: 'var(--peg-radius-sm)',
                  }}
                >
                  <summary style={{ cursor: 'pointer' }}>
                    <Group
                      between
                      wrap
                      style={{ display: 'inline-flex', width: 'calc(100% - 20px)' }}
                    >
                      <Stack gap={0}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{message.subject}</span>
                        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                          {message.toEmail} · {formatDateTime(message.createdAt)}
                        </span>
                      </Stack>
                      <Badge tone="neutral">{label(OUTBOX_STATUS_LABELS, message.status)}</Badge>
                    </Group>
                  </summary>
                  <pre
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {message.body}
                  </pre>
                </details>
              ))
            )}
          </Stack>
        </Card>
      )}

      {inviteOpen ? (
        <InviteModal
          orgId={orgId}
          onClose={() => {
            setInviteOpen(false);
          }}
          onDone={() => {
            toast.success('Convite registrado', 'A mensagem está na caixa de saída.');
            setInviteOpen(false);
            invitesQ.reload();
            outboxQ.reload();
          }}
        />
      ) : null}
      <ConfirmModal
        open={revoking !== null}
        onClose={() => {
          setRevoking(null);
        }}
        onConfirm={() => {
          if (revoking) void revoke(revoking);
        }}
        title="Revogar convite?"
        body="O link do convite deixa de funcionar."
        confirmLabel="Revogar"
        danger
        loading={busy}
      />
    </div>
  );
}

/** Convite por e-mail (auditoria 2026-09-10, P2-04: antes pedia o ID de um usuário existente). */
function InviteModal({
  orgId,
  onClose,
  onDone,
}: {
  orgId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('agent');
  const [errors, setErrors] = useState<FieldErrors<'email' | 'role'>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setServerError(null);
    const found = inviteErrors({ email, role });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const body: { email: string; role: string; name?: string } = { email: email.trim(), role };
      if (name.trim()) body.name = name.trim();
      await apiClient(`/organizations/${orgId}/invites`, { method: 'POST', body });
      onDone();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Falha ao convidar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Convidar membro"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="invite-form" loading={busy}>
            Registrar convite
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
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
          label="E-mail"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          placeholder="pessoa@imobiliaria.com.br"
          {...(errors.email ? { error: errors.email } : {})}
        />
        <Input
          label="Nome da pessoa"
          optional
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <Select
          label="Função"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
          }}
          options={Object.entries(ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          {...(errors.role ? { error: errors.role } : {})}
        />
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          O convite vale por 72 horas e fica registrado na caixa de saída desta organização. Nenhum
          e-mail é enviado neste ambiente.
        </span>
      </form>
    </Modal>
  );
}

export function MembersClient({ orgId }: { orgId: string }) {
  return (
    <ToastProvider>
      <MembersBody orgId={orgId} />
    </ToastProvider>
  );
}
