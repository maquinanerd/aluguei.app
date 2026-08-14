'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  ConfirmModal,
  Group,
  Icon,
  Input,
  Inspector,
  InspectorRows,
  InspectorSection,
  Modal,
  Stack,
  Tabs,
  Tag,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatArea, formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS } from '@/lib/labels';
import { PermissionDenied, EmptyState, ErrorState } from '@aluguei/ui';

interface Property {
  id: string;
  title: string;
  propertyType: string;
  status: string;
  description?: string;
  totalAreaSqm: number | null;
  builtAreaSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  furnished: boolean;
  petsAllowed: boolean | null;
  addresses: Array<{ id: string; label: string | null; street: string | null; number: string | null; neighborhood: string | null; city: string | null; state: string | null; isPublic: boolean }>;
  financialTerms: {
    monthlyRentCents: number;
    condoFeeCents: number | null;
    iptuCents: number | null;
    securityDepositCents: number | null;
    minimumLeaseMonths: number | null;
    availableFrom: string | null;
  } | null;
  owners: Array<{ partyId: string; name: string; ownershipSharePct: number | null }>;
  features: string[];
  media: Array<{ id: string; kind: string; isPublic: boolean }>;
  createdAt: string;
}

interface Party {
  id: string;
  name: string;
  type: string;
}

interface Listing {
  id: string;
  status: string;
  title: string;
}

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'dados', label: 'Dados' },
  { value: 'midia', label: 'Mídia' },
  { value: 'proprietario', label: 'Proprietário' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'historico', label: 'Histórico' },
];

function PropertyBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [featureInput, setFeatureInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const propQ = useQuery<{ property: Property }>(`/properties/${id}`, [id]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', [id]);
  const listingsQ = useQuery<{ listings: Listing[] }>('/listings?limit=50', [id]);

  const property = propQ.data?.property ?? null;
  const partyMap = useMemo(() => {
    const m = new Map<string, Party>();
    for (const p of partiesQ.data?.parties ?? []) m.set(p.id, p);
    return m;
  }, [partiesQ.data]);

  if (propQ.permissionDenied) return <PermissionDenied title="Sem acesso ao imóvel" />;

  if (!property && !propQ.loading) {
    return (
      <EmptyState
        title="Imóvel não encontrado"
        body="Verifique o endereço ou volte para a lista."
        actionLabel="Voltar para imóveis"
        onAction={() => { router.push('/app/properties'); }}
      />
    );
  }

  if (!property) {
    return <EmptyState title="Carregando imóvel…" icon="home" />;
  }

  const address = property.addresses.find((a) => !a.isPublic) ?? property.addresses[0] ?? null;

  async function addFeature() {
    const f = featureInput.trim();
    if (!f) return;
    setBusy(true);
    try {
      await apiClient(`/properties/${id}/features`, { method: 'POST', body: { feature: f } });
      setFeatureInput('');
      toast.success('Característica adicionada');
      propQ.reload();
    } catch (err) {
      toast.error('Falha', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function removeFeature(feature: string) {
    try {
      await apiClient(`/properties/${id}/features/${encodeURIComponent(feature)}`, { method: 'DELETE' });
      toast.success('Característica removida');
      propQ.reload();
    } catch (err) {
      toast.error('Falha', err instanceof Error ? err.message : undefined);
    }
  }

  async function removeProperty() {
    setBusy(true);
    try {
      await apiClient(`/properties/${id}`, { method: 'DELETE' });
      toast.success('Imóvel removido');
      router.push('/app/properties');
    } catch (err) {
      toast.error('Falha ao remover', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Stack gap={4} style={{ maxWidth: 1400, width: '100%', margin: '0 auto' }}>
      <Breadcrumb items={[{ label: 'Painel', href: '/app' }, { label: 'Imóveis', href: '/app/properties' }, { label: property.title }]} />

      {/* Property Header */}
      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Stack gap={1}>
            <Group gap={2}>
              <h1 style={{ fontSize: 20 }}>{property.title}</h1>
              <Badge tone={property.status === 'ACTIVE' ? 'success' : 'neutral'}>{label(PROPERTY_STATUS_LABELS, property.status)}</Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              {label(PROPERTY_TYPE_LABELS, property.propertyType)}
              {address?.neighborhood ? ` · ${address.neighborhood}` : ''}
              {address?.city ? `, ${address.city}` : ''}
              {address?.state ? ` · ${address.state}` : ''}
            </span>
            <Group gap={2} style={{ marginTop: 8 }}>
              {property.bedrooms !== null ? <Tag icon="home">{`${String(property.bedrooms)} dorm.`}</Tag> : null}
              {property.bathrooms !== null ? <Tag icon="home">{`${String(property.bathrooms)} ban.`}</Tag> : null}
              {property.parkingSpots !== null ? <Tag icon="home">{`${String(property.parkingSpots)} vagas`}</Tag> : null}
              {property.totalAreaSqm !== null ? <Tag icon="mapPin">{formatArea(property.totalAreaSqm)}</Tag> : null}
            </Group>
          </Stack>
          <Group gap={2}>
            <Button variant="secondary" size="sm" icon={<Icon name="edit" size={14} />} onClick={() => { setTermOpen(true); }}>
              Termos financeiros
            </Button>
            <Button variant="danger-subtle" size="sm" icon={<Icon name="trash" size={14} />} onClick={() => { setConfirmDelete(true); }}>
              Remover
            </Button>
          </Group>
        </Group>
      </div>

      <Group stretch gap={0} style={{ alignItems: 'stretch' }}>
        <div className="peg-stack" style={{ flex: 1, minWidth: 0, gap: 16 }}>
          <Tabs items={TABS} value={tab} onChange={setTab} />

          {tab === 'overview' ? (
            <Stack gap={4}>
              <Card title="Sobre o imóvel" padless>
                <Stack gap={3} style={{ padding: 20 }}>
                  {property.description ? <p style={{ fontSize: 14, lineHeight: '21px' }}>{property.description}</p> : null}
                  <div className="peg-grid cols-2">
                    <InfoRow label="Endereço" value={address ? [address.street, address.number, address.neighborhood, address.city].filter(Boolean).join(', ') : 'Não informado'} />
                    <InfoRow label="Status" value={label(PROPERTY_STATUS_LABELS, property.status)} />
                    <InfoRow label="Dormitórios" value={property.bedrooms !== null ? String(property.bedrooms) : '—'} />
                    <InfoRow label="Banheiros" value={property.bathrooms !== null ? String(property.bathrooms) : '—'} />
                    <InfoRow label="Vagas" value={property.parkingSpots !== null ? String(property.parkingSpots) : '—'} />
                    <InfoRow label="Área total" value={formatArea(property.totalAreaSqm)} />
                  </div>
                </Stack>
              </Card>

              <Card title="Listings" padless>
                {listingsQ.data && listingsQ.data.listings.length > 0 ? (
                  <Stack gap={0}>
                    {listingsQ.data.listings.map((l) => (
                      <Group key={l.id} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                        <span className="peg-grow peg-truncate" style={{ fontSize: 13 }}>{l.title}</span>
                        <Badge tone={l.status === 'PUBLISHED' ? 'success' : 'neutral'}>{l.status}</Badge>
                      </Group>
                    ))}
                  </Stack>
                ) : (
                  <div className="peg-empty" style={{ padding: 24 }}>
                    <span className="peg-empty__body">Nenhum listing criado para este imóvel.</span>
                  </div>
                )}
              </Card>
            </Stack>
          ) : null}

          {tab === 'dados' ? (
            <Card title="Dados e características" padless>
              <Stack gap={4} style={{ padding: 20 }}>
                <div className="peg-grid cols-2">
                  <InfoRow label="Área construída" value={formatArea(property.builtAreaSqm)} />
                  <InfoRow label="Mobiliado" value={property.furnished ? 'Sim' : 'Não'} />
                  <InfoRow label="Aceita pets" value={property.petsAllowed === true ? 'Sim' : property.petsAllowed === false ? 'Não' : 'Não informado'} />
                </div>
                <Stack gap={2}>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Características</span>
                  <Group gap={2} wrap>
                    {property.features.map((f) => (
                      <Tag key={f} icon="check" onRemove={() => { void removeFeature(f); }}>
                        {f}
                      </Tag>
                    ))}
                    {property.features.length === 0 ? <span className="peg-text-tertiary" style={{ fontSize: 13 }}>Nenhuma característica.</span> : null}
                  </Group>
                  <Group gap={2}>
                    <Input size="sm" placeholder="Ex.: varanda, churrasqueira…" value={featureInput} onChange={(e) => { setFeatureInput(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') { void addFeature(); } }} />
                    <Button size="sm" variant="secondary" loading={busy} onClick={() => { void addFeature(); }}>
                      Adicionar
                    </Button>
                  </Group>
                </Stack>
              </Stack>
            </Card>
          ) : null}

          {tab === 'midia' ? (
            <Card title="Mídia" padless>
              <div className="peg-grid cols-4" style={{ padding: 20 }}>
                {property.media.map((m) => (
                  <div key={m.id} className="peg-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                    <Icon name={m.kind === 'PHOTO' ? 'image' : m.kind === 'FLOORPLAN' ? 'grid' : 'fileText'} size={24} />
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{m.kind}</span>
                    {m.isPublic ? <Badge tone="success">Público</Badge> : <Badge tone="neutral">Privado</Badge>}
                  </div>
                ))}
                {property.media.length === 0 ? (
                  <div className="peg-empty" style={{ gridColumn: '1 / -1', padding: 32 }}>
                    <span className="peg-empty__body">Nenhuma mídia enviada ainda.</span>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {tab === 'proprietario' ? (
            <Card title="Proprietários" padless>
              {property.owners.length === 0 ? (
                <div className="peg-empty" style={{ padding: 24 }}>
                  <span className="peg-empty__body">Nenhum proprietário vinculado.</span>
                </div>
              ) : (
                <Stack gap={0}>
                  {property.owners.map((o) => (
                    <Group key={o.partyId} gap={3} style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                      <Icon name="user" size={14} />
                      <span className="peg-grow" style={{ fontSize: 13 }}>{o.name}</span>
                      {o.ownershipSharePct !== null ? (
                        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{`${String(o.ownershipSharePct)}%`}</span>
                      ) : null}
                    </Group>
                  ))}
                </Stack>
              )}
            </Card>
          ) : null}

          {tab === 'financeiro' ? (
            <Card title="Termos financeiros" padless>
              <Stack gap={3} style={{ padding: 20 }}>
                {property.financialTerms ? (
                  <div className="peg-grid cols-2">
                    <InfoRow label="Aluguel mensal" value={formatBRL(property.financialTerms.monthlyRentCents)} />
                    <InfoRow label="Condomínio" value={formatBRL(property.financialTerms.condoFeeCents)} />
                    <InfoRow label="IPTU" value={formatBRL(property.financialTerms.iptuCents)} />
                    <InfoRow label="Caução" value={formatBRL(property.financialTerms.securityDepositCents)} />
                    <InfoRow label="Meses mínimos" value={property.financialTerms.minimumLeaseMonths !== null ? String(property.financialTerms.minimumLeaseMonths) : '—'} />
                    <InfoRow label="Disponível desde" value={formatDate(property.financialTerms.availableFrom)} />
                  </div>
                ) : (
                  <span className="peg-text-secondary" style={{ fontSize: 13 }}>Termos financeiros não definidos.</span>
                )}
                <Group gap={2}>
                  <Button size="sm" variant="secondary" onClick={() => { setTermOpen(true); }}>
                    Editar termos
                  </Button>
                </Group>
              </Stack>
            </Card>
          ) : null}

          {tab === 'historico' ? (
            <Card title="Histórico" padless>
              <div className="peg-empty" style={{ padding: 24 }}>
                <span className="peg-empty__body">
                  O timeline de imóveis não é suportado pelo backend atual (entityType suportados:
                  LEAD, PARTY, PROPOSAL, VISIT, TASK). Acompanhe o histórico via partes e ocorrências.
                </span>
              </div>
            </Card>
          ) : null}
        </div>

        {/* Context rail */}
        <Inspector>
          <InspectorSection title="Imóvel">
            <InspectorRows
              rows={[
                { label: 'Tipo', value: label(PROPERTY_TYPE_LABELS, property.propertyType) },
                { label: 'Status', value: label(PROPERTY_STATUS_LABELS, property.status) },
                { label: 'Criado em', value: formatDate(property.createdAt) },
              ]}
            />
          </InspectorSection>
          <InspectorSection title="Aluguel">
            <InspectorRows
              rows={[
                {
                  label: 'Mensal',
                  value: property.financialTerms ? formatBRL(property.financialTerms.monthlyRentCents) : '—',
                },
                {
                  label: 'Condomínio',
                  value: property.financialTerms?.condoFeeCents != null ? formatBRL(property.financialTerms.condoFeeCents) : '—',
                },
              ]}
            />
          </InspectorSection>
          <InspectorSection title="Proprietários">
            <InspectorRows
              rows={property.owners.slice(0, 3).map((o) => ({ label: partyMap.get(o.partyId)?.name ?? o.name, value: o.ownershipSharePct !== null ? `${String(o.ownershipSharePct)}%` : '—' }))}
            />
          </InspectorSection>
        </Inspector>
      </Group>

      {propQ.error ? <ErrorState body={propQ.error} onRetry={propQ.reload} /> : null}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => { setConfirmDelete(false); }}
        onConfirm={() => { void removeProperty(); }}
        title="Remover imóvel"
        body={`Remover "${property.title}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        danger
        loading={busy}
      />

      <FinancialTermsModal
        open={termOpen}
        onClose={() => { setTermOpen(false); }}
        propertyId={id}
        initial={property.financialTerms}
        onSaved={() => {
          toast.success('Termos atualizados');
          setTermOpen(false);
          propQ.reload();
        }}
      />
    </Stack>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={1}>
      <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 14 }}>{value}</span>
    </Stack>
  );
}

function FinancialTermsModal({
  open,
  onClose,
  propertyId,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  initial: Property['financialTerms'];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [monthlyRent, setMonthlyRent] = useState(initial ? String(initial.monthlyRentCents / 100) : '');
  const [condoFee, setCondoFee] = useState(initial?.condoFeeCents != null ? String(initial.condoFeeCents / 100) : '');
  const [iptu, setIptu] = useState(initial?.iptuCents != null ? String(initial.iptuCents / 100) : '');
  const [securityDeposit, setSecurityDeposit] = useState(initial?.securityDepositCents != null ? String(initial.securityDepositCents / 100) : '');
  const [busy, setBusy] = useState(false);

  function toCents(v: string): number | undefined {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const rent = toCents(monthlyRent);
    if (rent === undefined || rent <= 0) {
      toast.error('Aluguel mensal é obrigatório');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, number> = { monthlyRentCents: rent };
      const condo = toCents(condoFee);
      if (condo !== undefined) body.condoFeeCents = condo;
      const i = toCents(iptu);
      if (i !== undefined) body.iptuCents = i;
      const dep = toCents(securityDeposit);
      if (dep !== undefined) body.securityDepositCents = dep;
      await apiClient(`/properties/${propertyId}/financial-terms`, { method: 'PUT', body });
      onSaved();
    } catch (err) {
      toast.error('Falha ao salvar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Termos financeiros"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="terms-form" loading={busy}>Salvar</Button>
        </>
      }
    >
      <form id="terms-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void submit(e); }}>
        <Input label="Aluguel mensal (R$)" required inputMode="decimal" value={monthlyRent} onChange={(e) => { setMonthlyRent(e.target.value); }} placeholder="3.500" />
        <div className="peg-grid cols-2">
          <Input label="Condomínio (R$)" optional inputMode="decimal" value={condoFee} onChange={(e) => { setCondoFee(e.target.value); }} />
          <Input label="IPTU (R$)" optional inputMode="decimal" value={iptu} onChange={(e) => { setIptu(e.target.value); }} />
        </div>
        <Input label="Caução (R$)" optional inputMode="decimal" value={securityDeposit} onChange={(e) => { setSecurityDeposit(e.target.value); }} />
      </form>
    </Modal>
  );
}

export function PropertyDetailClient() {
  return (
    <ToastProvider>
      <PropertyBody />
    </ToastProvider>
  );
}
