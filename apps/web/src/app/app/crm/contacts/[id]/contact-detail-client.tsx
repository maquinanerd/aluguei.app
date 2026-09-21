'use client';

import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  ConfirmModal,
  DataTable,
  EmptyState,
  ErrorState,
  Group,
  Icon,
  IconButton,
  Input,
  Modal,
  PermissionDenied,
  Select,
  Stack,
  Tabs,
  Tag,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { formatDate, formatDateTime } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, PARTY_ROLE_LABELS, PARTY_TYPE_LABELS } from '@/lib/labels';
import {
  formatBytes,
  formatIdentityValue,
  identityError,
  IDENTITY_KIND_LABELS,
  IDENTITY_KIND_OPTIONS,
  PARTY_DOCUMENT_KIND_LABELS,
  PARTY_DOCUMENT_KIND_OPTIONS,
  PARTY_DOCUMENT_MAX_BYTES,
  PARTY_DOCUMENT_MIME_TYPES,
} from '@/lib/party-rules';
import type { IdentityKind } from '@/lib/party-rules';

interface Address {
  label?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  isPublic?: boolean;
}

interface PartyDocument {
  id: string;
  kind: string;
  documentKey: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

interface PartyDetail {
  party: {
    id: string;
    type: 'PERSON' | 'COMPANY';
    name: string;
    status: 'ACTIVE' | 'ARCHIVED';
    identities: Array<{ kind: IdentityKind; value: string }>;
    addresses: Address[];
    createdAt: string;
    updatedAt: string;
  };
  roles: string[];
  consents: Array<{ id: string; purpose: string; grantedAt: string; revokedAt: string | null }>;
  documents: PartyDocument[];
}

const TABS = [
  { value: 'dados', label: 'Dados' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'consentimentos', label: 'Consentimentos' },
];

const CONSENT_LABELS: Record<string, string> = {
  CREDIT_SCREENING: 'Análise de crédito',
};

function addressLine(address: Address): string {
  const street = [address.street, address.number].filter(Boolean).join(', ');
  const city = [address.city, address.state].filter(Boolean).join('/');
  return [street, address.neighborhood, city, address.zipCode].filter(Boolean).join(' · ') || '—';
}

function ContactBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('dados');
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [removing, setRemoving] = useState<PartyDocument | null>(null);
  const [busy, setBusy] = useState(false);

  const detailQ = useQuery<PartyDetail>(`/parties/${id}`, [id]);

  if (detailQ.permissionDenied) return <PermissionDenied title="Sem acesso a contatos" />;
  const detail = detailQ.data;
  if (!detail) {
    if (detailQ.error) {
      return (
        <EmptyState
          title="Contato não encontrado"
          body="Verifique o endereço ou volte para a lista."
          icon="helpCircle"
          actionLabel="Voltar para contatos"
          onAction={() => {
            router.push('/app/crm/contacts');
          }}
        />
      );
    }
    return <EmptyState title="Carregando contato…" icon="activity" />;
  }
  const { party } = detail;
  const archived = party.status === 'ARCHIVED';

  async function setStatus(status: 'ACTIVE' | 'ARCHIVED') {
    setBusy(true);
    try {
      await apiClient(`/parties/${id}`, { method: 'PATCH', body: { status } });
      toast.success(status === 'ARCHIVED' ? 'Contato arquivado' : 'Contato reativado');
      setArchiveOpen(false);
      detailQ.reload();
    } catch (err) {
      toast.error('Falha ao atualizar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(document: PartyDocument) {
    setBusy(true);
    try {
      await apiClient(`/parties/${id}/documents/${document.id}`, { method: 'DELETE' });
      toast.success('Documento removido');
      setRemoving(null);
      detailQ.reload();
    } catch (err) {
      toast.error('Falha ao remover', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const documentColumns: Column<PartyDocument>[] = [
    {
      key: 'kind',
      header: 'Tipo',
      render: (d) => (
        <span style={{ fontWeight: 500 }}>{label(PARTY_DOCUMENT_KIND_LABELS, d.kind)}</span>
      ),
    },
    {
      key: 'size',
      header: 'Tamanho',
      render: (d) => <span className="peg-text-secondary">{formatBytes(d.sizeBytes)}</span>,
    },
    {
      key: 'created',
      header: 'Enviado em',
      render: (d) => <span className="peg-text-tertiary">{formatDateTime(d.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (d) => (
        <IconButton
          label={`Remover ${label(PARTY_DOCUMENT_KIND_LABELS, d.kind)}`}
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setRemoving(d);
          }}
        >
          <Icon name="trash" size={14} />
        </IconButton>
      ),
    },
  ];

  return (
    <Stack gap={4} style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { label: 'Painel', href: '/app' },
          { label: 'Contatos', href: '/app/crm/contacts' },
          { label: party.name },
        ]}
      />

      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Group gap={3}>
            <Avatar name={party.name} size="lg" brand />
            <Stack gap={1}>
              <Group gap={2} wrap>
                <h1 style={{ fontSize: 20 }}>{party.name}</h1>
                <Badge tone={party.type === 'COMPANY' ? 'info' : 'neutral'}>
                  {label(PARTY_TYPE_LABELS, party.type)}
                </Badge>
                <Badge tone={archived ? 'neutral' : 'success'}>
                  {archived ? 'Arquivado' : 'Ativo'}
                </Badge>
              </Group>
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Desde {formatDate(party.createdAt)} · atualizado em {formatDate(party.updatedAt)}
              </span>
            </Stack>
          </Group>
          <Group gap={2}>
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon name="edit" size={14} />}
              onClick={() => {
                setEditOpen(true);
              }}
            >
              Editar
            </Button>
            {archived ? (
              <Button
                size="sm"
                variant="brand"
                loading={busy}
                onClick={() => void setStatus('ACTIVE')}
              >
                Reativar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="danger-subtle"
                onClick={() => {
                  setArchiveOpen(true);
                }}
              >
                Arquivar
              </Button>
            )}
          </Group>
        </Group>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === 'dados' ? (
        <div className="peg-grid cols-2" style={{ alignItems: 'start' }}>
          <Card title="Identificadores" padless>
            <Stack gap={2} style={{ padding: 16 }}>
              {party.identities.map((identity) => (
                <Group key={`${identity.kind}:${identity.value}`} between>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                    {label(IDENTITY_KIND_LABELS, identity.kind)}
                  </span>
                  <span style={{ fontSize: 14 }}>
                    {formatIdentityValue(identity.kind, identity.value)}
                  </span>
                </Group>
              ))}
            </Stack>
          </Card>
          <Card title="Papéis" padless>
            <Group gap={2} wrap style={{ padding: 16 }}>
              {detail.roles.length === 0 ? (
                <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                  Nenhum papel definido.
                </span>
              ) : (
                detail.roles.map((role) => (
                  <Tag key={role} icon="user">
                    {label(PARTY_ROLE_LABELS, role)}
                  </Tag>
                ))
              )}
            </Group>
          </Card>
          <Card title="Endereços" padless>
            <Stack gap={2} style={{ padding: 16 }}>
              {party.addresses.length === 0 ? (
                <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                  Nenhum endereço cadastrado.
                </span>
              ) : (
                party.addresses.map((address, index) => (
                  <Stack key={index} gap={0}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {address.label ?? `Endereço ${String(index + 1)}`}
                    </span>
                    <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                      {addressLine(address)}
                    </span>
                  </Stack>
                ))
              )}
            </Stack>
          </Card>
        </div>
      ) : null}

      {tab === 'documentos' ? (
        <Card
          title="Documentos"
          padless
          actions={
            <Button
              size="sm"
              variant="brand"
              icon={<Icon name="upload" size={14} />}
              onClick={() => {
                setUploadOpen(true);
              }}
            >
              Enviar documento
            </Button>
          }
        >
          <DataTable
            columns={documentColumns}
            rows={detail.documents}
            emptyTitle="Nenhum documento"
            emptyBody="Comprovantes de renda, de endereço e documentos de identidade da pessoa."
          />
        </Card>
      ) : null}

      {tab === 'consentimentos' ? (
        <Card title="Consentimentos (LGPD)" padless>
          <Stack gap={2} style={{ padding: 16 }}>
            {detail.consents.length === 0 ? (
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                Nenhum consentimento registrado.
              </span>
            ) : (
              detail.consents.map((consent) => (
                <Group key={consent.id} between>
                  <span style={{ fontSize: 14 }}>{label(CONSENT_LABELS, consent.purpose)}</span>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                    {consent.revokedAt
                      ? `Revogado em ${formatDateTime(consent.revokedAt)}`
                      : `Concedido em ${formatDateTime(consent.grantedAt)}`}
                  </span>
                </Group>
              ))
            )}
          </Stack>
        </Card>
      ) : null}

      {detailQ.error ? <ErrorState body={detailQ.error} onRetry={detailQ.reload} /> : null}

      {/* Montado só aberto: o formulário parte do estado atual do contato. */}
      {editOpen ? (
        <EditPartyModal
          open
          detail={detail}
          onClose={() => {
            setEditOpen(false);
          }}
          onSaved={() => {
            toast.success('Contato atualizado');
            setEditOpen(false);
            detailQ.reload();
          }}
        />
      ) : null}
      <UploadDocumentModal
        open={uploadOpen}
        partyId={id}
        onClose={() => {
          setUploadOpen(false);
        }}
        onUploaded={() => {
          toast.success('Documento enviado');
          setUploadOpen(false);
          detailQ.reload();
        }}
      />
      <ConfirmModal
        open={archiveOpen}
        onClose={() => {
          setArchiveOpen(false);
        }}
        onConfirm={() => void setStatus('ARCHIVED')}
        title="Arquivar contato?"
        body="O contato sai da lista de ativos e continua nos registros em que aparece. Você pode reativá-lo depois."
        confirmLabel="Arquivar"
        danger
        loading={busy}
      />
      <ConfirmModal
        open={removing !== null}
        onClose={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing) void removeDocument(removing);
        }}
        title="Remover documento?"
        body="O documento deixa de aparecer para a pessoa."
        confirmLabel="Remover"
        danger
        loading={busy}
      />
    </Stack>
  );
}

interface IdentityRow {
  kind: IdentityKind;
  value: string;
  error: string | null;
}

function toRows(detail: PartyDetail): IdentityRow[] {
  return detail.party.identities.map((identity) => ({
    kind: identity.kind,
    value: formatIdentityValue(identity.kind, identity.value),
    error: null,
  }));
}

function EditPartyModal({
  open,
  detail,
  onClose,
  onSaved,
}: {
  open: boolean;
  detail: PartyDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(detail.party.name);
  const [type, setType] = useState(detail.party.type);
  const [roles, setRoles] = useState<string[]>(detail.roles);
  const [identities, setIdentities] = useState<IdentityRow[]>(() => toRows(detail));
  const [addresses, setAddresses] = useState<Address[]>(detail.party.addresses);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateIdentity(index: number, patch: Partial<IdentityRow>) {
    setIdentities((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch, error: null } : row)),
    );
  }

  function updateAddress(index: number, patch: Partial<Address>) {
    setAddresses((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(e: SyntheticEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Informe o nome');
      return;
    }
    const checked = identities.map((row) => ({
      ...row,
      error: identityError(row.kind, row.value),
    }));
    setIdentities(checked);
    if (checked.length === 0) {
      setError('Informe ao menos um identificador');
      return;
    }
    if (checked.some((row) => row.error !== null)) {
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/parties/${detail.party.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          type,
          roles,
          identities: checked.map((row) => ({ kind: row.kind, value: row.value.trim() })),
          addresses: addresses.map((address) => {
            const clean: Address = { isPublic: address.isPublic ?? false };
            for (const field of [
              'label',
              'street',
              'number',
              'complement',
              'neighborhood',
              'city',
              'state',
              'zipCode',
              'country',
            ] as const) {
              const value = address[field]?.trim();
              if (value) clean[field] = value;
            }
            return clean;
          }),
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar contato"
      size="lg"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="edit-party-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="edit-party-form"
        className="peg-stack"
        style={{ gap: 16 }}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        {error ? (
          <span className="peg-field__error" role="alert">
            {error}
          </span>
        ) : null}
        <div className="peg-grid cols-2">
          <Input
            label="Nome"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
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
        </div>

        <fieldset className="peg-stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="peg-field__label">Papéis</legend>
          <Group gap={3} wrap>
            {Object.entries(PARTY_ROLE_LABELS).map(([role, roleLabel]) => (
              <Checkbox
                key={role}
                label={roleLabel}
                checked={roles.includes(role)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRoles((current) =>
                    checked ? [...current, role] : current.filter((r) => r !== role),
                  );
                }}
              />
            ))}
          </Group>
        </fieldset>

        <fieldset className="peg-stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="peg-field__label">Identificadores</legend>
          {identities.map((row, index) => {
            const n = String(index + 1);
            return (
              <Group key={index} gap={2} style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 170 }}>
                  <Select
                    aria-label={`Tipo do identificador ${n}`}
                    value={row.kind}
                    onChange={(e) => {
                      updateIdentity(index, { kind: e.target.value as IdentityKind });
                    }}
                    options={IDENTITY_KIND_OPTIONS}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    aria-label={`Valor do identificador ${n}`}
                    value={row.value}
                    onChange={(e) => {
                      updateIdentity(index, { value: e.target.value });
                    }}
                    {...(row.error ? { error: row.error } : {})}
                  />
                </div>
                <IconButton
                  label={`Remover identificador ${n}`}
                  size="sm"
                  onClick={() => {
                    setIdentities((rows) => rows.filter((_, i) => i !== index));
                  }}
                >
                  <Icon name="x" size={14} />
                </IconButton>
              </Group>
            );
          })}
          <div>
            <Button
              variant="tertiary"
              size="sm"
              icon={<Icon name="plus" size={14} />}
              onClick={() => {
                setIdentities((rows) => [...rows, { kind: 'EMAIL', value: '', error: null }]);
              }}
            >
              Adicionar identificador
            </Button>
          </div>
        </fieldset>

        <fieldset className="peg-stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="peg-field__label">Endereços</legend>
          {addresses.map((address, index) => {
            const n = String(index + 1);
            return (
              <div
                key={index}
                className="peg-stack"
                style={{
                  gap: 8,
                  padding: 12,
                  border: '1px solid var(--peg-border)',
                  borderRadius: 'var(--peg-radius-sm)',
                }}
              >
                <Group between>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Endereço {n}</span>
                  <IconButton
                    label={`Remover endereço ${n}`}
                    size="sm"
                    onClick={() => {
                      setAddresses((rows) => rows.filter((_, i) => i !== index));
                    }}
                  >
                    <Icon name="x" size={14} />
                  </IconButton>
                </Group>
                <div className="peg-grid cols-2">
                  <Input
                    label={`Rótulo do endereço ${n}`}
                    optional
                    value={address.label ?? ''}
                    onChange={(e) => {
                      updateAddress(index, { label: e.target.value });
                    }}
                    placeholder="Casa, trabalho…"
                  />
                  <Input
                    label={`CEP do endereço ${n}`}
                    optional
                    value={address.zipCode ?? ''}
                    onChange={(e) => {
                      updateAddress(index, { zipCode: e.target.value });
                    }}
                  />
                  <Input
                    label={`Logradouro do endereço ${n}`}
                    optional
                    value={address.street ?? ''}
                    onChange={(e) => {
                      updateAddress(index, { street: e.target.value });
                    }}
                  />
                  <Input
                    label={`Número do endereço ${n}`}
                    optional
                    value={address.number ?? ''}
                    onChange={(e) => {
                      updateAddress(index, { number: e.target.value });
                    }}
                  />
                  <Input
                    label={`Bairro do endereço ${n}`}
                    optional
                    value={address.neighborhood ?? ''}
                    onChange={(e) => {
                      updateAddress(index, { neighborhood: e.target.value });
                    }}
                  />
                  <Input
                    label={`Cidade do endereço ${n}`}
                    optional
                    value={address.city ?? ''}
                    onChange={(e) => {
                      updateAddress(index, { city: e.target.value });
                    }}
                  />
                  <Input
                    label={`UF do endereço ${n}`}
                    optional
                    maxLength={2}
                    value={address.state ?? ''}
                    onChange={(e) => {
                      updateAddress(index, { state: e.target.value.toUpperCase() });
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div>
            <Button
              variant="tertiary"
              size="sm"
              icon={<Icon name="plus" size={14} />}
              onClick={() => {
                setAddresses((rows) => [...rows, { isPublic: false }]);
              }}
            >
              Adicionar endereço
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function UploadDocumentModal({
  open,
  partyId,
  onClose,
  onUploaded,
}: {
  open: boolean;
  partyId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [kind, setKind] = useState<string>('IDENTITY');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setKind('IDENTITY');
    setFile(null);
    setError(null);
    onClose();
  }

  async function submit(e: SyntheticEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Escolha o arquivo');
      return;
    }
    if (!(PARTY_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('Envie PDF, JPG, PNG ou WEBP');
      return;
    }
    if (file.size > PARTY_DOCUMENT_MAX_BYTES) {
      setError('O arquivo passa de 20 MB');
      return;
    }
    setBusy(true);
    try {
      const target = await apiClient<{ url: string; key: string }>(
        `/parties/${partyId}/documents/upload-url`,
        { method: 'POST', body: { kind, mimeType: file.type, sizeBytes: file.size } },
      );
      // Upload direto para o storage (URL pré-assinada); a API confere o objeto na confirmação.
      const put = await fetch(target.url, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) {
        throw new Error(`O storage recusou o arquivo (HTTP ${String(put.status)})`);
      }
      await apiClient(`/parties/${partyId}/documents/confirm`, {
        method: 'POST',
        body: { key: target.key, kind },
      });
      setFile(null);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no envio');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Enviar documento"
      footer={
        <>
          <Button variant="tertiary" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="upload-document-form" loading={busy}>
            Enviar
          </Button>
        </>
      }
    >
      <form
        id="upload-document-form"
        className="peg-stack"
        style={{ gap: 16 }}
        noValidate
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        {error ? (
          <span className="peg-field__error" role="alert">
            {error}
          </span>
        ) : null}
        <Select
          label="Tipo de documento"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
          }}
          options={PARTY_DOCUMENT_KIND_OPTIONS}
        />
        <Input
          label="Arquivo"
          type="file"
          accept={PARTY_DOCUMENT_MIME_TYPES.join(',')}
          helper="PDF, JPG, PNG ou WEBP, até 20 MB."
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
      </form>
    </Modal>
  );
}

export function ContactDetailClient() {
  return (
    <ToastProvider>
      <ContactBody />
    </ToastProvider>
  );
}
