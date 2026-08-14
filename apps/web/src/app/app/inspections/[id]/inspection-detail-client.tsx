'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  Group,
  Icon,
  Input,
  Inspector,
  InspectorRows,
  InspectorSection,
  Modal,
  Select,
  Stack,
  Tabs,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, INSPECTION_STATUS_LABELS, INSPECTION_STATUS_TONES } from '@/lib/labels';
import { PermissionDenied, EmptyState } from '@aluguei/ui';

interface Inspection {
  id: string;
  propertyId: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
}

interface Room {
  id: string;
  name: string;
  orderIndex: number;
}

interface Media {
  id: string;
  roomId: string | null;
  kind: string;
  isEvidence: boolean;
  capturedAt: string | null;
}

interface Observation {
  id: string;
  roomId: string | null;
  category: string;
  severity: string;
  description: string;
  source: 'HUMAN' | 'AI';
  status: string;
  aiSuggestionId: string | null;
  createdAt: string;
}

interface AiSuggestion {
  id: string;
  kind: string;
  confidence: number | null;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface Aggregate {
  inspection: Inspection;
  rooms: Room[];
  media: Media[];
  observations: Observation[];
  aiSuggestions: AiSuggestion[];
}

interface Property {
  id: string;
  title: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  DAMAGE: 'Dano',
  CONDITION: 'Condição',
  CLEANLINESS: 'Limpeza',
  FURNITURE: 'Mobília',
  INSTALLATION: 'Instalação',
  OTHER: 'Outro',
};

const SEVERITY_LABELS: Record<string, string> = {
  NONE: 'Nenhum',
  LOW: 'Baixo',
  MEDIUM: 'Médio',
  HIGH: 'Alto',
};

const SEVERITY_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  NONE: 'neutral',
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

const TYPE_LABELS: Record<string, string> = {
  CHECKIN: 'Entrada',
  CHECKOUT: 'Saída',
  INTERMEDIATE: 'Intermediária',
};

const TABS = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'ambientes', label: 'Ambientes' },
  { value: 'ocorrencias', label: 'Ocorrências' },
  { value: 'revisao-ia', label: 'Revisão IA' },
  { value: 'relatorio', label: 'Relatório' },
];

function InspectionBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('resumo');
  const [busy, setBusy] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [obsOpen, setObsOpen] = useState(false);
  const [obsRoom, setObsRoom] = useState('');
  const [obsCategory, setObsCategory] = useState('DAMAGE');
  const [obsSeverity, setObsSeverity] = useState('MEDIUM');
  const [obsDesc, setObsDesc] = useState('');

  const aggQ = useQuery<Aggregate>(`/inspections/${id}`, [id]);
  const propsQ = useQuery<{ properties: Property[]; total: number }>('/properties?limit=200', [id]);

  const agg = aggQ.data;
  const inspection = agg?.inspection ?? null;
  const property = useMemo(
    () => propsQ.data?.properties.find((p) => p.id === inspection?.propertyId) ?? null,
    [propsQ.data, inspection],
  );

  if (aggQ.permissionDenied) return <PermissionDenied title="Sem acesso à vistoria" />;

  if (!inspection && !aggQ.loading) {
    return (
      <EmptyState
        title="Vistoria não encontrada"
        actionLabel="Voltar"
        onAction={() => { router.push('/app/inspections'); }}
      />
    );
  }
  if (!inspection || !agg) return <EmptyState title="Carregando vistoria…" icon="camera" />;

  async function addRoom(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!roomName.trim()) return;
    setBusy(true);
    try {
      await apiClient(`/inspections/${id}/rooms`, { method: 'POST', body: { name: roomName.trim() } });
      setRoomName('');
      aggQ.reload();
    } catch (err) {
      toast.error('Falha ao criar ambiente', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function addObservation(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!obsDesc.trim()) return;
    setBusy(true);
    try {
      const body: { category: string; severity: string; description: string; roomId?: string } = {
        category: obsCategory,
        severity: obsSeverity,
        description: obsDesc.trim(),
      };
      if (obsRoom) body.roomId = obsRoom;
      await apiClient(`/inspections/${id}/observations`, { method: 'POST', body });
      setObsOpen(false);
      setObsDesc('');
      aggQ.reload();
    } catch (err) {
      toast.error('Falha ao registrar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function runProcess() {
    setBusy(true);
    try {
      await apiClient(`/inspections/${id}/process`, { method: 'POST' });
      toast.success('Processamento iniciado', 'Áudio e mídia em análise.');
      aggQ.reload();
    } catch (err) {
      toast.error('Falha no processamento', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: string) {
    setBusy(true);
    try {
      await apiClient(`/inspections/${id}/status`, { method: 'PATCH', body: { status: next } });
      toast.success('Status atualizado', label(INSPECTION_STATUS_LABELS, next));
      aggQ.reload();
    } catch (err) {
      toast.error('Falha ao atualizar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function resolveSuggestion(suggestionId: string, action: 'ACCEPT' | 'REJECT' | 'EDIT', description?: string) {
    try {
      const body: { action: string; description?: string } = { action };
      if (description) body.description = description;
      await apiClient(`/inspections/${id}/ai-suggestions/${suggestionId}`, { method: 'PATCH', body });
      toast.success(action === 'ACCEPT' ? 'Sugestão aceita' : action === 'REJECT' ? 'Sugestão rejeitada' : 'Sugestão editada');
      aggQ.reload();
    } catch (err) {
      toast.error('Falha', err instanceof Error ? err.message : undefined);
    }
  }

  const roomMap = useMemo(() => {
    const m = new Map<string, Room>();
    for (const r of agg.rooms) m.set(r.id, r);
    return m;
  }, [agg.rooms]);

  const pendingSuggestions = agg.aiSuggestions.filter((s) => s.status === 'PENDING');

  return (
    <Stack gap={4} style={{ maxWidth: 1400, width: '100%', margin: '0 auto' }}>
      <Breadcrumb items={[{ label: 'Painel', href: '/app' }, { label: 'Vistorias', href: '/app/inspections' }, { label: property?.title ?? 'Vistoria' }]} />

      <div className="peg-card" style={{ padding: 20 }}>
        <Group between stretch gap={4} wrap>
          <Stack gap={1}>
            <Group gap={2}>
              <h1 style={{ fontSize: 20 }}>{property?.title ?? 'Vistoria'}</h1>
              <Badge tone="neutral">{TYPE_LABELS[inspection.type] ?? inspection.type}</Badge>
              <Badge tone={INSPECTION_STATUS_TONES[inspection.status] ?? 'neutral'}>{label(INSPECTION_STATUS_LABELS, inspection.status)}</Badge>
            </Group>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              Agendada para {formatDate(inspection.scheduledAt)} · criada em {formatDate(inspection.createdAt)}
            </span>
          </Stack>
          <Group gap={2}>
            <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} loading={busy} onClick={() => { void runProcess(); }}>
              Processar mídia
            </Button>
            <Select
              size="sm"
              value=""
              onChange={(e) => { if (e.target.value) void changeStatus(e.target.value); }}
              placeholder="Mudar status…"
              options={Object.entries(INSPECTION_STATUS_LABELS)
                .filter(([v]) => v !== inspection.status)
                .map(([v, l]) => ({ value: v, label: l }))}
              aria-label="Mudar status"
            />
          </Group>
        </Group>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === 'resumo' ? (
        <div className="peg-grid cols-2">
          <Card title="Mídia" padless>
            <Stack gap={0}>
              <div className="peg-grid cols-3" style={{ padding: 16 }}>
                <SummaryTile icon="image" label="Fotos" value={agg.media.filter((m) => m.kind === 'PHOTO').length} />
                <SummaryTile icon="mic" label="Áudios" value={agg.media.filter((m) => m.kind === 'AUDIO').length} />
                <SummaryTile icon="play" label="Vídeos" value={agg.media.filter((m) => m.kind === 'VIDEO').length} />
              </div>
            </Stack>
          </Card>
          <Card title="Progresso" padless>
            <Stack gap={3} style={{ padding: 20 }}>
              <InspectorRows
                rows={[
                  { label: 'Ambientes', value: String(agg.rooms.length) },
                  { label: 'Ocorrências', value: String(agg.observations.length) },
                  { label: 'Sugestões IA pendentes', value: String(pendingSuggestions.length) },
                  { label: 'Mídia de evidência', value: String(agg.media.filter((m) => m.isEvidence).length) },
                ]}
              />
            </Stack>
          </Card>
        </div>
      ) : null}

      {tab === 'ambientes' ? (
        <Card title="Ambientes" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            <Group gap={2} wrap>
              {agg.rooms.map((r) => (
                <Badge key={r.id} tone="neutral">{r.name}</Badge>
              ))}
              {agg.rooms.length === 0 ? <span className="peg-text-tertiary" style={{ fontSize: 13 }}>Nenhum ambiente criado.</span> : null}
            </Group>
            <form className="peg-group" style={{ gap: 8 }} onSubmit={(e) => { void addRoom(e); }}>
              <Input size="sm" placeholder="Nome do ambiente (ex.: Sala)" value={roomName} onChange={(e) => { setRoomName(e.target.value); }} />
              <Button size="sm" variant="secondary" loading={busy}>Adicionar</Button>
            </form>
          </Stack>
        </Card>
      ) : null}

      {tab === 'ocorrencias' ? (
        <Card
          title="Ocorrências"
          actions={
            <Button size="sm" variant="brand" icon={<Icon name="plus" size={14} />} onClick={() => { setObsOpen(true); }}>
              Nova ocorrência
            </Button>
          }
          padless
        >
          {agg.observations.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhuma ocorrência registrada.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {agg.observations.map((o) => (
                <Group key={o.id} gap={3} style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <Badge tone={SEVERITY_TONES[o.severity] ?? 'neutral'}>{SEVERITY_LABELS[o.severity] ?? o.severity}</Badge>
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {CATEGORY_LABELS[o.category] ?? o.category}
                      {o.roomId ? ` · ${roomMap.get(o.roomId)?.name ?? '—'}` : ''}
                    </span>
                    <span className="peg-text-secondary" style={{ fontSize: 12 }}>{o.description}</span>
                  </Stack>
                  <Badge tone={o.source === 'AI' ? 'info' : 'neutral'}>{o.source === 'AI' ? 'IA' : 'Humano'}</Badge>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      ) : null}

      {tab === 'revisao-ia' ? (
        <Card title="Sugestões da IA — confirmação humana" padless>
          {pendingSuggestions.length === 0 ? (
            <div className="peg-empty" style={{ padding: 24 }}>
              <span className="peg-empty__body">Nenhuma sugestão pendente. Processe a mídia para gerar sugestões.</span>
            </div>
          ) : (
            <Stack gap={0}>
              {pendingSuggestions.map((s) => (
                <Group key={s.id} gap={3} style={{ padding: '14px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                  <Icon name={s.kind === 'VISUAL' ? 'eye' : 'mic'} size={16} />
                  <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={2}>
                      <Badge tone="info">{s.kind === 'VISUAL' ? 'Visual' : 'Transcrição'}</Badge>
                      {s.confidence !== null ? (
                        <Badge tone="warning">confiança {Math.round(s.confidence * 100)}%</Badge>
                      ) : null}
                    </Group>
                    <span className="peg-text-secondary" style={{ fontSize: 12 }}>
                      {JSON.stringify(s.payload).slice(0, 160)}
                    </span>
                  </Stack>
                  <Group gap={1}>
                    <Button size="xs" variant="secondary" onClick={() => { void resolveSuggestion(s.id, 'ACCEPT'); }}>
                      Aceitar
                    </Button>
                    <Button size="xs" variant="tertiary" onClick={() => { void resolveSuggestion(s.id, 'REJECT'); }}>
                      Rejeitar
                    </Button>
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      ) : null}

      {tab === 'relatorio' ? (
        <Card title="Relatório" padless>
          <Stack gap={3} style={{ padding: 20 }}>
            <Group gap={2}>
              <Badge tone="neutral">{TYPE_LABELS[inspection.type] ?? inspection.type}</Badge>
              <Badge tone={INSPECTION_STATUS_TONES[inspection.status] ?? 'neutral'}>{label(INSPECTION_STATUS_LABELS, inspection.status)}</Badge>
            </Group>
            <InspectorRows
              rows={[
                { label: 'Ambientes', value: String(agg.rooms.length) },
                { label: 'Ocorrências', value: String(agg.observations.length) },
                { label: 'Sugestões IA', value: String(agg.aiSuggestions.length) },
                { label: 'Mídia', value: String(agg.media.length) },
              ]}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon name="fileText" size={14} />}
              onClick={() => { router.push(`/app/inspections/${id}`); toast.info('Relatório completo na aba de revisão'); }}
            >
              Relatório completo
            </Button>
          </Stack>
        </Card>
      ) : null}

      <Inspector style={{ width: '100%', borderLeft: 'none', borderTop: '1px solid var(--peg-border)' }}>
        <InspectorSection title="Vistoria">
          <InspectorRows
            rows={[
              { label: 'Imóvel', value: property?.title ?? '—' },
              { label: 'Tipo', value: TYPE_LABELS[inspection.type] ?? inspection.type },
              { label: 'Status', value: label(INSPECTION_STATUS_LABELS, inspection.status) },
              { label: 'Agendada', value: formatDate(inspection.scheduledAt) },
            ]}
          />
        </InspectorSection>
      </Inspector>

      <Modal
        open={obsOpen}
        onClose={() => { setObsOpen(false); }}
        title="Nova ocorrência"
        footer={
          <>
            <Button variant="tertiary" onClick={() => { setObsOpen(false); }}>Cancelar</Button>
            <Button variant="primary" type="submit" form="create-obs-form" loading={busy}>Registrar</Button>
          </>
        }
      >
        <form id="create-obs-form" className="peg-stack" style={{ gap: 16 }} onSubmit={(e) => { void addObservation(e); }}>
          <Select
            label="Ambiente"
            optional
            value={obsRoom}
            onChange={(e) => { setObsRoom(e.target.value); }}
            placeholder="Sem ambiente"
            options={agg.rooms.map((r) => ({ value: r.id, label: r.name }))}
          />
          <div className="peg-grid cols-2">
            <Select
              label="Categoria"
              value={obsCategory}
              onChange={(e) => { setObsCategory(e.target.value); }}
              options={Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
            <Select
              label="Severidade"
              value={obsSeverity}
              onChange={(e) => { setObsSeverity(e.target.value); }}
              options={Object.entries(SEVERITY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
          </div>
          <Input label="Descrição" required value={obsDesc} onChange={(e) => { setObsDesc(e.target.value); }} placeholder="Descreva a ocorrência…" />
        </form>
      </Modal>
    </Stack>
  );
}

function SummaryTile({ icon, label, value }: { icon: 'image' | 'mic' | 'play'; label: string; value: number }) {
  return (
    <div className="peg-stack" style={{ gap: 4, alignItems: 'center', padding: '12px 8px', border: '1px solid var(--peg-border)', borderRadius: 'var(--peg-radius-md)' }}>
      <Icon name={icon} size={18} />
      <span style={{ fontSize: 20, fontWeight: 600 }}>{String(value)}</span>
      <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}

export function InspectionDetailClient() {
  return (
    <ToastProvider>
      <InspectionBody />
    </ToastProvider>
  );
}
