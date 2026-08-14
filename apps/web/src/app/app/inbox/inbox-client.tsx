'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Group,
  Icon,
  Input,
  Select,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { cx, formatRelative } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { label, FUNNEL_LABELS, FUNNEL_TONES, CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_TONES } from '@/lib/labels';
import { PermissionDenied, EmptyState, ErrorState } from '@aluguei/ui';

interface Conversation {
  id: string;
  leadId: string | null;
  partyId: string | null;
  waContactId: string | null;
  status: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: 'USER' | 'AGENT' | 'BOT';
  body: string;
  messageType: string;
  sentAt: string;
  createdAt: string;
}

interface Intent {
  id: string;
  intent: string;
  propertyId: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  moveInDate: string | null;
  extractedBy: string;
  confidence: number | null;
  createdAt: string;
}

interface Party {
  id: string;
  name: string;
  type: string;
}

interface Lead {
  id: string;
  status: string;
  partyId: string | null;
}

const INTENT_LABELS: Record<string, string> = {
  VISIT_REQUEST: 'Pedido de visita',
  PRICE_QUERY: 'Consulta de preço',
  AVAILABILITY: 'Disponibilidade',
  OTHER: 'Outro',
};

function InboxBody() {
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const convQ = useQuery<{ conversations: Conversation[]; total: number }>(
    statusFilter ? `/conversations?limit=100&status=${statusFilter}` : '/conversations?limit=100',
    [statusFilter],
  );
  const msgQ = useQuery<{ messages: Message[]; total: number }>(selectedId ? `/conversations/${selectedId}/messages?limit=100` : null, [selectedId]);
  const intentQ = useQuery<{ intents: Intent[] }>(selectedId ? `/conversations/${selectedId}/intents` : null, [selectedId]);
  const partiesQ = useQuery<{ parties: Party[] }>('/parties?limit=200', []);
  const leadsQ = useQuery<{ leads: Lead[] }>('/leads?limit=100', []);

  if (convQ.permissionDenied) return <PermissionDenied title="Sem acesso ao inbox" />;

  const partyMap = useMemo(() => {
    const m = new Map<string, Party>();
    for (const p of partiesQ.data?.parties ?? []) m.set(p.id, p);
    return m;
  }, [partiesQ.data]);

  const leadMap = useMemo(() => {
    const m = new Map<string, Lead>();
    for (const l of leadsQ.data?.leads ?? []) m.set(l.id, l);
    return m;
  }, [leadsQ.data]);

  const conversations = useMemo(() => {
    const rows = convQ.data?.conversations ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const party = c.partyId ? partyMap.get(c.partyId) : null;
      return (party?.name ?? c.waContactId ?? c.id).toLowerCase().includes(q);
    });
  }, [convQ.data, search, partyMap]);

  const selected = selectedId ? convQ.data?.conversations.find((c) => c.id === selectedId) ?? null : null;
  const selectedParty = selected?.partyId ? partyMap.get(selected.partyId) ?? null : null;
  const selectedLead = selected?.leadId ? leadMap.get(selected.leadId) ?? null : null;

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [msgQ.data]);

  async function sendMessage(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      await apiClient(`/conversations/${selectedId}/messages`, { method: 'POST', body: { body: draft.trim() } });
      setDraft('');
      msgQ.reload();
      convQ.reload();
    } catch (err) {
      toast.error('Falha ao enviar', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  async function handoff() {
    if (!selectedId) return;
    try {
      await apiClient(`/conversations/${selectedId}/handoff`, { method: 'POST', body: {} });
      toast.success('Handoff solicitado', 'A conversa aguarda um humano.');
      convQ.reload();
    } catch (err) {
      toast.error('Falha no handoff', err instanceof Error ? err.message : undefined);
    }
  }

  const intents = intentQ.data?.intents ?? [];

  return (
    <div className="app-page" style={{ maxWidth: 1600 }}>
      <div className="inbox-grid">
        {/* Conversation list */}
        <section className={cx('inbox-list', selectedId && 'inbox-list--hidden')}>
          <Stack gap={2} style={{ padding: 12, borderBottom: '1px solid var(--peg-border)' }}>
            <Group between>
              <strong style={{ fontSize: 14 }}>Inbox</strong>
              <Badge tone="neutral">{convQ.data?.total ?? 0}</Badge>
            </Group>
            <Input size="sm" placeholder="Buscar conversa…" value={search} onChange={(e) => { setSearch(e.target.value); }} />
            <Select
              size="sm"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); }}
              placeholder="Todas"
              options={Object.entries(CONVERSATION_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              aria-label="Filtrar conversas"
            />
          </Stack>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {convQ.loading ? (
              <EmptyState title="Carregando…" icon="messageCircle" />
            ) : conversations.length === 0 ? (
              <EmptyState title="Sem conversas" body="As conversas de WhatsApp aparecerão aqui." icon="messageCircle" />
            ) : (
              conversations.map((c) => {
                const party = c.partyId ? partyMap.get(c.partyId) : null;
                const isActive = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedId(c.id); }}
                    className="peg-stack"
                    style={{
                      gap: 4,
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid var(--peg-border)',
                      background: isActive ? 'var(--aluguei-brand-faint)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Group between>
                      <span className="peg-truncate" style={{ fontSize: 13, fontWeight: 600 }}>
                        {party?.name ?? c.waContactId ?? 'Contato'}
                      </span>
                      <span className="peg-text-tertiary" style={{ fontSize: 11 }}>
                        {formatRelative(c.updatedAt)}
                      </span>
                    </Group>
                    <Group between>
                      <Badge tone={CONVERSATION_STATUS_TONES[c.status] ?? 'neutral'}>{label(CONVERSATION_STATUS_LABELS, c.status)}</Badge>
                      <span className="peg-text-tertiary" style={{ fontSize: 11 }}>{c.channel}</span>
                    </Group>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Active conversation */}
        <section className={cx('inbox-thread', selectedId && 'inbox-thread--active')}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState title="Selecione uma conversa" body="Escolha uma conversa na lista para visualizar o histórico." icon="messageCircle" />
            </div>
          ) : (
            <>
              <Group between style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}>
                <Group gap={2}>
                  <Button size="xs" variant="tertiary" className="inbox-back" aria-label="Voltar para conversas" onClick={() => { setSelectedId(null); }}>
                    <Icon name="arrowLeft" size={14} />
                  </Button>
                  <Avatar name={selectedParty?.name ?? selected.waContactId ?? '?'} size="sm" brand />
                  <Stack gap={0}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedParty?.name ?? selected.waContactId ?? 'Contato'}</span>
                    <span className="peg-text-tertiary" style={{ fontSize: 11 }}>{selected.channel}</span>
                  </Stack>
                </Group>
                <Group gap={2}>
                  {selected.status === 'NEEDS_HUMAN' ? (
                    <Button size="xs" variant="brand" onClick={() => { void handoff(); }}>
                      Assumir
                    </Button>
                  ) : null}
                  <Badge tone={CONVERSATION_STATUS_TONES[selected.status] ?? 'neutral'}>{label(CONVERSATION_STATUS_LABELS, selected.status)}</Badge>
                </Group>
              </Group>
              <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                {msgQ.loading ? (
                  <EmptyState title="Carregando mensagens…" icon="messageCircle" />
                ) : msgQ.data && msgQ.data.messages.length > 0 ? (
                  [...msgQ.data.messages].reverse().map((m) => (
                    <div
                      key={m.id}
                      className="peg-stack"
                      style={{
                        gap: 2,
                        alignSelf: m.direction === 'INBOUND' ? 'flex-start' : 'flex-end',
                        maxWidth: '75%',
                        background: m.direction === 'INBOUND' ? 'var(--peg-surface-subtle)' : 'var(--aluguei-brand-subtle)',
                        border: '1px solid var(--peg-border)',
                        borderRadius: 'var(--peg-radius-md)',
                        padding: '8px 12px',
                      }}
                    >
                      <span style={{ fontSize: 13, lineHeight: '19px', whiteSpace: 'pre-wrap' }}>{m.body}</span>
                      <span className="peg-text-tertiary" style={{ fontSize: 10, alignSelf: 'flex-end' }}>
                        {formatRelative(m.sentAt)} · {m.senderType === 'BOT' ? 'bot' : m.senderType === 'AGENT' ? 'assistente' : 'humano'}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState title="Sem mensagens" body="Envie a primeira mensagem para este contato." icon="messageCircle" />
                )}
              </div>
              <form onSubmit={(e) => { void sendMessage(e); }} className="peg-group" style={{ gap: 8, padding: 12, borderTop: '1px solid var(--peg-border)' }}>
                <Input size="md" placeholder="Digite a resposta…" value={draft} onChange={(e) => { setDraft(e.target.value); }} />
                <Button type="submit" variant="brand" size="md" loading={sending} icon={<Icon name="send" size={14} />}>
                  Enviar
                </Button>
              </form>
            </>
          )}
        </section>

        {/* CRM context panel */}
        <section className="inbox-context">
          <Stack gap={4} style={{ padding: 16, overflowY: 'auto' }}>
            <strong style={{ fontSize: 13 }}>Contexto do CRM</strong>
            {!selected ? (
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Selecione uma conversa.</span>
            ) : (
              <>
                <Stack gap={1}>
                  <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contato</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedParty?.name ?? 'Sem contato vinculado'}</span>
                  {selectedParty ? <span className="peg-text-tertiary" style={{ fontSize: 12 }}>{selectedParty.type === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física'}</span> : null}
                </Stack>
                <Stack gap={1}>
                  <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lead</span>
                  {selectedLead ? (
                    <Badge tone={FUNNEL_TONES[selectedLead.status] ?? 'neutral'}>{label(FUNNEL_LABELS, selectedLead.status)}</Badge>
                  ) : (
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Sem lead vinculado</span>
                  )}
                </Stack>
                <Stack gap={1}>
                  <span className="peg-text-tertiary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Intenção detectada</span>
                  {intents.length === 0 ? (
                    <span className="peg-text-tertiary" style={{ fontSize: 12 }}>Nenhuma intenção extraída ainda.</span>
                  ) : (
                    intents.map((i) => (
                      <Stack key={i.id} gap={1} style={{ padding: '8px 10px', border: '1px solid var(--peg-border)', borderRadius: 'var(--peg-radius-sm)' }}>
                        <Badge tone="info">{INTENT_LABELS[i.intent] ?? i.intent}</Badge>
                        {i.confidence !== null ? (
                          <span className="peg-text-tertiary" style={{ fontSize: 11 }}>confiança {Math.round(i.confidence * 100)}% · {i.extractedBy}</span>
                        ) : null}
                      </Stack>
                    ))
                  )}
                </Stack>
              </>
            )}
          </Stack>
        </section>
      </div>

      {convQ.error ? <ErrorState body={convQ.error} onRetry={convQ.reload} /> : null}
    </div>
  );
}

export function InboxClient() {
  return (
    <ToastProvider>
      <InboxBody />
    </ToastProvider>
  );
}
