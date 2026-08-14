'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
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
import type { Column } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, ROLE_LABELS } from '@/lib/labels';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

function MembersBody({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const membersPath = `/organizations/${orgId}/members`;
  const orgMembers = useQuery<{ members: Member[] }>(membersPath, [orgId]);

  if (orgMembers.permissionDenied) {
    return <PermissionDenied title="Sem acesso à equipe" />;
  }

  const members = useMemo(() => {
    const rows = orgMembers.data?.members ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [orgMembers.data, search]);

  async function updateRole(member: Member, role: string) {
    try {
      await apiClient(`/organizations/${orgId}/members/${member.userId}`, { method: 'PATCH', body: { role } });
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

  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: 'Membro',
      render: (m) => (
        <Group gap={2}>
          <Avatar name={m.name} size="sm" />
          <Stack gap={0}>
            <span style={{ fontWeight: 500 }}>{m.name}</span>
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{m.email}</span>
          </Stack>
        </Group>
      ),
    },
    {
      key: 'role',
      header: 'Função',
      render: (m) => <Badge tone={m.role === 'owner' || m.role === 'admin' ? 'brand' : 'neutral'}>{label(ROLE_LABELS, m.role)}</Badge>,
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
                onSelect: () => { void updateRole(m, r); },
              })),
            { key: 'remove', label: 'Remover da equipe', icon: 'trash', danger: true, onSelect: () => { void remove(m); } },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Usuários e equipe"
        description="Membros da organização e suas funções."
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar membro…' }}
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => { setCreateOpen(true); }}>
            Convidar membro
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={members}
        loading={orgMembers.loading}
        emptyTitle="Nenhum membro"
        emptyBody="Adicione membros à equipe para trabalhar em conjunto."
        emptyActionLabel="Convidar membro"
        onEmptyAction={() => { setCreateOpen(true); }}
      />
      {orgMembers.error ? <ErrorState body={orgMembers.error} onRetry={orgMembers.reload} /> : null}

      <InviteModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); }}
        orgId={orgId}
        onDone={() => {
          toast.success('Membro adicionado');
          setCreateOpen(false);
          orgMembers.reload();
        }}
      />
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  orgId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('agent');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!userId.trim()) return;
    setBusy(true);
    try {
      await apiClient(`/organizations/${orgId}/members`, { method: 'POST', body: { userId: userId.trim(), role } });
      setUserId('');
      setRole('agent');
      onDone();
    } catch (err) {
      toast.error('Falha ao adicionar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar membro"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="invite-form" loading={busy}>Adicionar</Button>
        </>
      }
    >
      <form id="invite-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Input label="ID do usuário" required value={userId} onChange={(e) => { setUserId(e.target.value); }} helper="Usuários são criados pelo registro; use o ID do usuário." />
        <Select
          label="Função"
          value={role}
          onChange={(e) => { setRole(e.target.value); }}
          options={Object.entries(ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
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
