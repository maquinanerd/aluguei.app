'use client';

import { useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
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
import { formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, PARTY_TYPE_LABELS } from '@/lib/labels';
import { formatIdentityValue, identityError, IDENTITY_KIND_OPTIONS } from '@/lib/party-rules';
import type { IdentityKind } from '@/lib/party-rules';
import { PageToolbar } from '@/components/page-toolbar';
import { PermissionDenied, ErrorState } from '@aluguei/ui';

interface Party {
  id: string;
  type: string;
  name: string;
  status: string;
  identities: Array<{ kind: string; value: string }>;
  addresses: Array<Record<string, unknown>>;
  createdAt: string;
}

function ContactsBody() {
  const toast = useToast();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  // Sem filtro, a API traz só as pessoas ativas; as arquivadas têm filtro próprio (P2-01).
  const path = showArchived ? '/parties?limit=100&status=ARCHIVED' : '/parties?limit=100';
  const { data, loading, error, permissionDenied, reload } = useQuery<{
    parties: Party[];
    total: number;
  }>(path, [path]);

  const parties = useMemo(() => {
    const rows = data?.parties ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.identities.some((i) => i.value.toLowerCase().includes(q)),
    );
  }, [data, search]);

  if (permissionDenied) return <PermissionDenied title="Sem acesso a contatos" />;

  const columns: Column<Party>[] = [
    {
      key: 'name',
      header: 'Contato',
      render: (p) => (
        <Group gap={2}>
          <Avatar name={p.name} size="sm" />
          <Stack gap={0}>
            <span style={{ fontWeight: 500 }}>{p.name}</span>
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              {p.identities.map((i) => formatIdentityValue(i.kind, i.value)).join(' · ')}
            </span>
          </Stack>
        </Group>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (p) => (
        <Badge tone={p.type === 'COMPANY' ? 'info' : 'neutral'}>
          {label(PARTY_TYPE_LABELS, p.type)}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Criado em',
      render: (p) => <span className="peg-text-tertiary">{formatDate(p.createdAt)}</span>,
    },
  ];

  return (
    <div className="app-page">
      <PageToolbar
        title="Contatos"
        description="Pessoas e empresas do relacionamento."
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Buscar por nome ou documento…',
        }}
        filters={
          <Select
            size="sm"
            value={showArchived ? 'ARCHIVED' : 'ACTIVE'}
            onChange={(e) => {
              setShowArchived(e.target.value === 'ARCHIVED');
            }}
            options={[
              { value: 'ACTIVE', label: 'Ativos' },
              { value: 'ARCHIVED', label: 'Arquivados' },
            ]}
            aria-label="Situação dos contatos"
          />
        }
        actions={
          <Button
            variant="brand"
            size="sm"
            icon={<Icon name="plus" size={14} />}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            Novo contato
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={parties}
        loading={loading}
        selectedIds={selected}
        onSelectIds={setSelected}
        onRowClick={(p) => {
          router.push(`/app/crm/contacts/${p.id}`);
        }}
        emptyTitle={showArchived ? 'Nenhum contato arquivado' : 'Nenhum contato'}
        emptyBody="Cadastre pessoas e empresas para vincular a leads e imóveis."
        emptyActionLabel="Novo contato"
        onEmptyAction={() => {
          setCreateOpen(true);
        }}
      />
      {error ? <ErrorState body={error} onRetry={reload} /> : null}

      <CreatePartyModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        onCreated={() => {
          toast.success('Contato criado');
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreatePartyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<'PERSON' | 'COMPANY'>('PERSON');
  const [name, setName] = useState('');
  const [identityKind, setIdentityKind] = useState<IdentityKind>('EMAIL');
  const [identityValue, setIdentityValue] = useState('');
  const [valueError, setValueError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<
    Array<{ partyId: string; name: string; reasons: string[] }>
  >([]);
  const [busy, setBusy] = useState(false);

  function reset() {
    setType('PERSON');
    setName('');
    setIdentityKind('EMAIL');
    setIdentityValue('');
    setValueError(null);
    setDuplicate([]);
  }

  async function submit(e: SyntheticEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // CPF e CNPJ com dígito verificador conferido antes de enviar (P2-01).
    const problem = identityError(identityKind, identityValue);
    setValueError(problem);
    if (problem) return;
    setBusy(true);
    setDuplicate([]);
    try {
      const res = await apiClient<{
        party: Party;
        duplicate: boolean;
        matchedPartyId: string | null;
      }>('/parties', {
        method: 'POST',
        body: {
          type,
          name: name.trim(),
          roles: [],
          identities: [{ kind: identityKind, value: identityValue.trim() }],
        },
      });
      if (res.duplicate) {
        const dup = await apiClient<{
          matches: Array<{ partyId: string; name: string; reasons: string[] }>;
        }>('/parties/dedupe', {
          method: 'POST',
          body: { identities: [{ kind: identityKind, value: identityValue.trim() }] },
        });
        setDuplicate(dup.matches);
        toast.warning('Possível duplicado', 'Um contato similar já existe.');
        return;
      }
      reset();
      onCreated();
    } catch (err) {
      toast.error('Falha ao criar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Novo contato"
      footer={
        <>
          <Button
            variant="tertiary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="create-party-form" loading={busy}>
            Salvar contato
          </Button>
        </>
      }
    >
      <form
        id="create-party-form"
        className="peg-stack"
        style={{ gap: 16 }}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        {duplicate.length > 0 ? (
          <div
            className="peg-error"
            style={{
              padding: 12,
              border: '1px solid var(--peg-warning)',
              borderRadius: 'var(--peg-radius-sm)',
              background: 'var(--peg-warning-bg)',
            }}
          >
            <span className="peg-error__title" style={{ color: 'var(--peg-warning)' }}>
              Possível duplicado encontrado
            </span>
            {duplicate.map((d) => (
              <span key={d.partyId} className="peg-error__body" style={{ display: 'block' }}>
                {d.name} ({d.reasons.join(', ')})
              </span>
            ))}
            <span className="peg-error__body">Revise antes de confirmar.</span>
          </div>
        ) : null}
        <Select
          label="Tipo"
          value={type}
          onChange={(e) => {
            setType(e.target.value as 'PERSON' | 'COMPANY');
          }}
          options={[
            { value: 'PERSON', label: 'Pessoa física' },
            { value: 'COMPANY', label: 'Pessoa jurídica' },
          ]}
        />
        <Input
          label="Nome"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={type === 'PERSON' ? 'Nome completo' : 'Razão social'}
        />
        <div className="peg-grid cols-2">
          <Select
            label="Tipo de identificador"
            value={identityKind}
            onChange={(e) => {
              setIdentityKind(e.target.value as IdentityKind);
              setValueError(null);
            }}
            options={IDENTITY_KIND_OPTIONS}
          />
          <Input
            label="Valor"
            required
            value={identityValue}
            {...(valueError ? { error: valueError } : {})}
            onChange={(e) => {
              setIdentityValue(e.target.value);
              setValueError(null);
            }}
            placeholder={identityKind === 'EMAIL' ? 'email@exemplo.com' : '00 0000-0000'}
          />
        </div>
      </form>
    </Modal>
  );
}

export function ContactsClient() {
  return (
    <ToastProvider>
      <ContactsBody />
    </ToastProvider>
  );
}
