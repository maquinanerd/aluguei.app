'use client';

import { useState } from 'react';
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
  MoneyInput,
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
import { PropertyOwnersCard } from './property-owners-card';

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
  addresses: Array<{
    id: string;
    label: string | null;
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    isPublic: boolean;
  }>;
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

interface Listing {
  id: string;
  status: string;
  title: string;
}

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'dados', label: 'Dados' },
  { value: 'midia', label: 'Mídia' },
  { value: 'proprietario', label: 'Proprietários' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'historico', label: 'Histórico' },
];

function PropertyBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [featureInput, setFeatureInput] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const propQ = useQuery<{ property: Property }>(`/properties/${id}`, [id]);
  const listingsQ = useQuery<{ listings: Listing[] }>('/listings?limit=50', [id]);

  // Os proprietários já vêm com nome no detalhe do imóvel: sem a lista de
  // pessoas com limit=200, recusada pela API (P1-01).
  const property = propQ.data?.property ?? null;

  if (propQ.permissionDenied) return <PermissionDenied title="Sem acesso ao imóvel" />;

  if (!property && !propQ.loading) {
    return (
      <EmptyState
        title="Imóvel não encontrado"
        body="Verifique o endereço ou volte para a lista."
        actionLabel="Voltar para imóveis"
        onAction={() => {
          router.push('/app/properties');
        }}
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
      await apiClient(`/properties/${id}/features/${encodeURIComponent(feature)}`, {
        method: 'DELETE',
      });
      toast.success('Característica removida');
      propQ.reload();
    } catch (err) {
      toast.error('Falha', err instanceof Error ? err.message : undefined);
    }
  }

  // A API não apaga imóvel (anúncios, contratos e auditoria dependem dele): arquiva e
  // reativa pelo status (auditoria 2026-09-10, P1-17).
  async function setPropertyStatus(status: 'ACTIVE' | 'ARCHIVED') {
    setBusy(true);
    try {
      await apiClient(`/properties/${id}`, { method: 'PATCH', body: { status } });
      toast.success(status === 'ARCHIVED' ? 'Imóvel arquivado' : 'Imóvel reativado');
      propQ.reload();
    } catch (err) {
      toast.error(
        status === 'ARCHIVED' ? 'Não foi possível arquivar' : 'Não foi possível reativar',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  }

  return (
    <Stack gap={4} style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { label: 'Painel', href: '/app' },
          { label: 'Imóveis', href: '/app/properties' },
          { label: property.title },
        ]}
      />

      {/* Property Header */}
      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Stack gap={1}>
            <Group gap={2}>
              <h1 style={{ fontSize: 20 }}>{property.title}</h1>
              <Badge tone={property.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {label(PROPERTY_STATUS_LABELS, property.status)}
              </Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              {label(PROPERTY_TYPE_LABELS, property.propertyType)}
              {address?.neighborhood ? ` · ${address.neighborhood}` : ''}
              {address?.city ? `, ${address.city}` : ''}
              {address?.state ? ` · ${address.state}` : ''}
            </span>
            <Group gap={2} style={{ marginTop: 8 }}>
              {property.bedrooms !== null ? (
                <Tag icon="home">{`${String(property.bedrooms)} dorm.`}</Tag>
              ) : null}
              {property.bathrooms !== null ? (
                <Tag icon="home">{`${String(property.bathrooms)} ban.`}</Tag>
              ) : null}
              {property.parkingSpots !== null ? (
                <Tag icon="home">{`${String(property.parkingSpots)} vagas`}</Tag>
              ) : null}
              {property.totalAreaSqm !== null ? (
                <Tag icon="mapPin">{formatArea(property.totalAreaSqm)}</Tag>
              ) : null}
            </Group>
          </Stack>
          <Group gap={2}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="edit" size={14} />}
              onClick={() => {
                setTermOpen(true);
              }}
            >
              Termos financeiros
            </Button>
            {property.status === 'ARCHIVED' ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon name="refresh" size={14} />}
                loading={busy}
                onClick={() => {
                  void setPropertyStatus('ACTIVE');
                }}
              >
                Reativar imóvel
              </Button>
            ) : (
              <Button
                variant="danger-subtle"
                size="sm"
                icon={<Icon name="package" size={14} />}
                onClick={() => {
                  setConfirmArchive(true);
                }}
              >
                Arquivar imóvel
              </Button>
            )}
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
                  {property.description ? (
                    <p style={{ fontSize: 14, lineHeight: '21px' }}>{property.description}</p>
                  ) : null}
                  <div className="peg-grid cols-2">
                    <InfoRow
                      label="Endereço"
                      value={
                        address
                          ? [address.street, address.number, address.neighborhood, address.city]
                              .filter(Boolean)
                              .join(', ')
                          : 'Não informado'
                      }
                    />
                    <InfoRow
                      label="Status"
                      value={label(PROPERTY_STATUS_LABELS, property.status)}
                    />
                    <InfoRow
                      label="Dormitórios"
                      value={property.bedrooms !== null ? String(property.bedrooms) : '—'}
                    />
                    <InfoRow
                      label="Banheiros"
                      value={property.bathrooms !== null ? String(property.bathrooms) : '—'}
                    />
                    <InfoRow
                      label="Vagas"
                      value={property.parkingSpots !== null ? String(property.parkingSpots) : '—'}
                    />
                    <InfoRow label="Área total" value={formatArea(property.totalAreaSqm)} />
                  </div>
                </Stack>
              </Card>

              <Card title="Listings" padless>
                {listingsQ.data && listingsQ.data.listings.length > 0 ? (
                  <Stack gap={0}>
                    {listingsQ.data.listings.map((l) => (
                      <Group
                        key={l.id}
                        gap={3}
                        style={{
                          padding: '10px 16px',
                          borderBottom: '1px solid var(--peg-border)',
                        }}
                      >
                        <span className="peg-grow peg-truncate" style={{ fontSize: 13 }}>
                          {l.title}
                        </span>
                        <Badge tone={l.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                          {l.status}
                        </Badge>
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
                  <InfoRow
                    label="Aceita pets"
                    value={
                      property.petsAllowed === true
                        ? 'Sim'
                        : property.petsAllowed === false
                          ? 'Não'
                          : 'Não informado'
                    }
                  />
                </div>
                <Stack gap={2}>
                  <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                    Características
                  </span>
                  <Group gap={2} wrap>
                    {property.features.map((f) => (
                      <Tag
                        key={f}
                        icon="check"
                        onRemove={() => {
                          void removeFeature(f);
                        }}
                      >
                        {f}
                      </Tag>
                    ))}
                    {property.features.length === 0 ? (
                      <span className="peg-text-tertiary" style={{ fontSize: 13 }}>
                        Nenhuma característica.
                      </span>
                    ) : null}
                  </Group>
                  <Group gap={2}>
                    <Input
                      size="sm"
                      placeholder="Ex.: varanda, churrasqueira…"
                      value={featureInput}
                      onChange={(e) => {
                        setFeatureInput(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void addFeature();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() => {
                        void addFeature();
                      }}
                    >
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
                  <div
                    key={m.id}
                    className="peg-card"
                    style={{
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    <Icon
                      name={
                        m.kind === 'PHOTO' ? 'image' : m.kind === 'FLOORPLAN' ? 'grid' : 'fileText'
                      }
                      size={24}
                    />
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                      {m.kind}
                    </span>
                    {m.isPublic ? (
                      <Badge tone="success">Público</Badge>
                    ) : (
                      <Badge tone="neutral">Privado</Badge>
                    )}
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
            <PropertyOwnersCard
              propertyId={property.id}
              owners={property.owners}
              onChanged={propQ.reload}
            />
          ) : null}

          {tab === 'financeiro' ? (
            <Card title="Termos financeiros" padless>
              <Stack gap={3} style={{ padding: 20 }}>
                {property.financialTerms ? (
                  <div className="peg-grid cols-2">
                    <InfoRow
                      label="Aluguel mensal"
                      value={formatBRL(property.financialTerms.monthlyRentCents)}
                    />
                    <InfoRow
                      label="Condomínio"
                      value={formatBRL(property.financialTerms.condoFeeCents)}
                    />
                    <InfoRow label="IPTU" value={formatBRL(property.financialTerms.iptuCents)} />
                    <InfoRow
                      label="Caução"
                      value={formatBRL(property.financialTerms.securityDepositCents)}
                    />
                    <InfoRow
                      label="Meses mínimos"
                      value={
                        property.financialTerms.minimumLeaseMonths !== null
                          ? String(property.financialTerms.minimumLeaseMonths)
                          : '—'
                      }
                    />
                    <InfoRow
                      label="Disponível desde"
                      value={formatDate(property.financialTerms.availableFrom)}
                    />
                  </div>
                ) : (
                  <span className="peg-text-secondary" style={{ fontSize: 13 }}>
                    Termos financeiros não definidos.
                  </span>
                )}
                <Group gap={2}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setTermOpen(true);
                    }}
                  >
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
                  LEAD, PARTY, PROPOSAL, VISIT, TASK). Acompanhe o histórico via partes e
                  ocorrências.
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
                  value: property.financialTerms
                    ? formatBRL(property.financialTerms.monthlyRentCents)
                    : '—',
                },
                {
                  label: 'Condomínio',
                  value:
                    property.financialTerms?.condoFeeCents != null
                      ? formatBRL(property.financialTerms.condoFeeCents)
                      : '—',
                },
              ]}
            />
          </InspectorSection>
          <InspectorSection title="Proprietários">
            <InspectorRows
              rows={property.owners.slice(0, 3).map((o) => ({
                label: o.name,
                value: o.ownershipSharePct !== null ? `${String(o.ownershipSharePct)}%` : '—',
              }))}
            />
          </InspectorSection>
        </Inspector>
      </Group>

      {propQ.error ? <ErrorState body={propQ.error} onRetry={propQ.reload} /> : null}

      <ConfirmModal
        open={confirmArchive}
        onClose={() => {
          setConfirmArchive(false);
        }}
        onConfirm={() => {
          void setPropertyStatus('ARCHIVED');
        }}
        title="Arquivar imóvel"
        body={`Arquivar "${property.title}"? Ele sai da lista de ativos, mantém o histórico e pode ser reativado depois.`}
        confirmLabel="Arquivar"
        danger
        loading={busy}
      />

      <FinancialTermsModal
        open={termOpen}
        onClose={() => {
          setTermOpen(false);
        }}
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
      <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
        {label}
      </span>
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
  // Valores em centavos inteiros: o MoneyInput interpreta "3.500" como R$ 3.500,00
  // (antes parseFloat("3.500") gravava R$ 3,50 — auditoria 2026-09-10, P0-07).
  const [monthlyRentCents, setMonthlyRentCents] = useState<number | null>(
    initial?.monthlyRentCents ?? null,
  );
  const [condoFeeCents, setCondoFeeCents] = useState<number | null>(initial?.condoFeeCents ?? null);
  const [iptuCents, setIptuCents] = useState<number | null>(initial?.iptuCents ?? null);
  const [securityDepositCents, setSecurityDepositCents] = useState<number | null>(
    initial?.securityDepositCents ?? null,
  );
  const [rentError, setRentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (monthlyRentCents === null || monthlyRentCents <= 0) {
      setRentError('Informe o aluguel mensal, como em 3.500,00.');
      return;
    }
    setRentError(null);
    setBusy(true);
    try {
      const body: Record<string, number> = { monthlyRentCents };
      if (condoFeeCents !== null) body.condoFeeCents = condoFeeCents;
      if (iptuCents !== null) body.iptuCents = iptuCents;
      if (securityDepositCents !== null) body.securityDepositCents = securityDepositCents;
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
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="terms-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="terms-form"
        className="peg-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <MoneyInput
          label="Aluguel mensal (R$)"
          required
          valueCents={monthlyRentCents}
          onValueChange={(cents) => {
            setMonthlyRentCents(cents);
            if (cents !== null && cents > 0) setRentError(null);
          }}
          placeholder="3.500,00"
          {...(rentError ? { error: rentError } : {})}
        />
        <div className="peg-grid cols-2">
          <MoneyInput
            label="Condomínio (R$)"
            optional
            valueCents={condoFeeCents}
            onValueChange={setCondoFeeCents}
          />
          <MoneyInput
            label="IPTU (R$)"
            optional
            valueCents={iptuCents}
            onValueChange={setIptuCents}
          />
        </div>
        <MoneyInput
          label="Caução (R$)"
          optional
          valueCents={securityDepositCents}
          onValueChange={setSecurityDepositCents}
        />
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
