'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmModal,
  ErrorState,
  Group,
  Input,
  Kpi,
  Modal,
  PermissionDenied,
  Select,
  Stack,
  Switch,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import {
  label,
  CHANNEL_STATUS_LABELS,
  CHANNEL_STATUS_TONES,
  INTEGRATION_STAGE_LABELS,
  INTEGRATION_STAGE_TONES,
} from '@/lib/labels';
import {
  CANAL_PRO_PASSOS,
  DESTINATION_LABELS,
  PORTAL_PROPERTY_TYPE_LABELS,
  PUBLICATION_TIER_LABELS,
  quando,
} from '@/lib/grupo-olx';
import type { Motivo } from '@/lib/grupo-olx';
import { PageToolbar } from '@/components/page-toolbar';

interface Conexao {
  id: string;
  enabled: boolean;
  destinations: string[];
  externalAccountId: string | null;
  externalCustomerId: string | null;
  displayAddress: string;
  listingQuota: number | null;
  featuredQuota: number | null;
  superFeaturedQuota: number | null;
  feedToken: { hint: string; createdAt: string } | null;
  lastFeedFetchAt: string | null;
  lastCrawlerFetchAt: string | null;
  lastCrawlerListingCount: number | null;
  lastReportAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

interface Visao {
  stage: string;
  connection: Conexao | null;
  publicContactEmail: string | null;
  installation: { feedAvailable: boolean; leadsWebhookConfigured: boolean };
  counts: Record<
    | 'total'
    | 'pending'
    | 'eligible'
    | 'awaitingImport'
    | 'imported'
    | 'importedWithWarnings'
    | 'importErrors'
    | 'blocked'
    | 'removing'
    | 'premium'
    | 'superPremium',
    number
  >;
  leads: { received: number; duplicates: number; lastReceivedAt: string | null };
  lastReport: {
    reportDate: string | null;
    receivedAt: string;
    contracted: number | null;
    created: number | null;
    updated: number | null;
    deleted: number | null;
    errors: number | null;
    warnings: number | null;
  } | null;
  warnings: Array<{ code: string; message: string }>;
}

interface Linha {
  listingId: string;
  title: string;
  status: string;
  publicationTier: string;
  portalPropertyType: string | null;
  issues: Motivo[];
}

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function dataHora(iso: string | null): string {
  return iso === null ? '—' : DATA_HORA.format(new Date(iso));
}

function inteiroOuNulo(valor: string): number | null {
  const limpo = valor.trim();
  if (limpo === '') return null;
  const numero = Number(limpo);
  return Number.isInteger(numero) && numero >= 0 ? numero : null;
}

function GrupoOlxBody() {
  const toast = useToast();
  const visaoQ = useQuery<Visao>('/integrations/grupo-olx', []);
  const bloqueadosQ = useQuery<{ items: Linha[]; total: number }>(
    '/integrations/grupo-olx/listings?status=BLOCKED&limit=50',
    [],
  );
  const recusadosQ = useQuery<{ items: Linha[]; total: number }>(
    '/integrations/grupo-olx/listings?status=IMPORT_ERROR&limit=50',
    [],
  );
  const [agora] = useState(() => new Date());

  if (visaoQ.permissionDenied) return <PermissionDenied title="Sem acesso a canais" />;

  function recarregar() {
    visaoQ.reload();
    bloqueadosQ.reload();
    recusadosQ.reload();
  }

  const visao = visaoQ.data;
  const conexao = visao?.connection ?? null;

  return (
    <div className="app-page">
      <PageToolbar
        title="Grupo OLX"
        description="Um feed VRSync para ZAP Imóveis, Viva Real e OLX, e os leads de volta no CRM."
        actions={
          <Link href="/app/channels" className="peg-btn peg-btn--secondary peg-btn--sm">
            Voltar para Canais
          </Link>
        }
      />

      {visaoQ.error ? <ErrorState body={visaoQ.error} onRetry={visaoQ.reload} /> : null}

      {visao ? (
        <Stack gap={4}>
          <Group gap={2} wrap>
            <Badge tone={INTEGRATION_STAGE_TONES[visao.stage] ?? 'neutral'}>
              {label(INTEGRATION_STAGE_LABELS, visao.stage)}
            </Badge>
            <span className="peg-text-secondary" style={{ fontSize: 12 }}>
              O código está pronto e testado; nenhuma conta real do Grupo OLX validou o fluxo ainda.
              Depois do piloto com uma imobiliária, este selo muda.
            </span>
          </Group>

          {visao.warnings.length > 0 ? (
            <Card title="O que falta" padless>
              <Stack gap={0}>
                {visao.warnings.map((aviso) => (
                  <div
                    key={aviso.code}
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}
                  >
                    <span style={{ fontSize: 13 }}>{aviso.message}</span>
                  </div>
                ))}
              </Stack>
            </Card>
          ) : null}

          <div className="peg-grid cols-2">
            <ContatoCard
              email={visao.publicContactEmail}
              aoSalvar={() => {
                toast.success('E-mail salvo', 'Os anúncios do Grupo OLX serão reavaliados.');
                recarregar();
              }}
              aoFalhar={(mensagem) => {
                toast.error('Não foi possível salvar', mensagem);
              }}
            />
            <ConexaoCard
              conexao={conexao}
              aoSalvar={() => {
                toast.success('Conexão salva');
                recarregar();
              }}
              aoFalhar={(mensagem) => {
                toast.error('Não foi possível salvar', mensagem);
              }}
            />
          </div>

          <FeedCard
            conexao={conexao}
            feedDisponivel={visao.installation.feedAvailable}
            aoMudar={recarregar}
          />

          <Card title="Acompanhamento">
            <Stack gap={3}>
              <div className="peg-grid cols-4">
                <Kpi label="Prontos para o feed" value={String(visao.counts.eligible)} />
                <Kpi label="No feed, aguardando" value={String(visao.counts.awaitingImport)} />
                <Kpi
                  label="Importados"
                  value={String(visao.counts.imported + visao.counts.importedWithWarnings)}
                />
                <Kpi
                  label="Bloqueados ou recusados"
                  value={String(visao.counts.blocked + visao.counts.importErrors)}
                />
              </div>
              <Stack gap={1}>
                <span style={{ fontSize: 13 }}>
                  Última busca do Grupo OLX: {quando(conexao?.lastCrawlerFetchAt ?? null, agora)}
                  {conexao?.lastCrawlerListingCount !== null &&
                  conexao?.lastCrawlerListingCount !== undefined
                    ? ` · ${String(conexao.lastCrawlerListingCount)} ${conexao.lastCrawlerListingCount === 1 ? 'anúncio' : 'anúncios'} no arquivo`
                    : ''}
                </span>
                <span style={{ fontSize: 13 }}>
                  Último relatório de importação:{' '}
                  {visao.lastReport
                    ? `${dataHora(visao.lastReport.reportDate ?? visao.lastReport.receivedAt)} · ${String(visao.lastReport.created ?? 0)} criados, ${String(visao.lastReport.updated ?? 0)} atualizados, ${String(visao.lastReport.deleted ?? 0)} removidos, ${String(visao.lastReport.errors ?? 0)} com erro`
                    : 'nenhum (o relatório por webhook depende da homologação)'}
                </span>
                <span style={{ fontSize: 13 }}>
                  Leads recebidos: {String(visao.leads.received)}
                  {visao.leads.duplicates > 0
                    ? ` · ${String(visao.leads.duplicates)} entregas repetidas descartadas`
                    : ''}
                  {` · último ${quando(visao.leads.lastReceivedAt, agora)}`}
                </span>
                {conexao?.lastErrorAt ? (
                  <span style={{ fontSize: 13 }} className="peg-text-secondary">
                    Último problema ({dataHora(conexao.lastErrorAt)}): {conexao.lastErrorMessage}
                  </span>
                ) : null}
              </Stack>
            </Stack>
          </Card>

          <AtencaoCard
            linhas={[...(recusadosQ.data?.items ?? []), ...(bloqueadosQ.data?.items ?? [])]}
            carregando={bloqueadosQ.loading || recusadosQ.loading}
            aoAjustar={recarregar}
          />
        </Stack>
      ) : null}
    </div>
  );
}

function ContatoCard({
  email,
  aoSalvar,
  aoFalhar,
}: {
  email: string | null;
  aoSalvar: () => void;
  aoFalhar: (mensagem: string | undefined) => void;
}) {
  const [valor, setValor] = useState(email ?? '');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setValor(email ?? '');
  }, [email]);

  async function salvar() {
    setSalvando(true);
    try {
      await apiClient('/organization/contact', {
        method: 'PUT',
        body: { publicContactEmail: valor },
      });
      aoSalvar();
    } catch (err) {
      aoFalhar(err instanceof Error ? err.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card title="Contato da imobiliária">
      <Stack gap={2}>
        <Input
          label="E-mail público de contato"
          type="email"
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
          }}
          helper="Vai em todo anúncio do Grupo OLX. Use um e-mail da imobiliária, não o login de alguém da equipe."
        />
        <Group gap={2}>
          <Button
            size="sm"
            variant="primary"
            loading={salvando}
            onClick={() => {
              void salvar();
            }}
          >
            Salvar e-mail
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function ConexaoCard({
  conexao,
  aoSalvar,
  aoFalhar,
}: {
  conexao: Conexao | null;
  aoSalvar: () => void;
  aoFalhar: (mensagem: string | undefined) => void;
}) {
  const [ligada, setLigada] = useState(conexao?.enabled ?? false);
  const [destinos, setDestinos] = useState<string[]>(conexao?.destinations ?? []);
  const [conta, setConta] = useState(conexao?.externalAccountId ?? '');
  const [cliente, setCliente] = useState(conexao?.externalCustomerId ?? '');
  const [cota, setCota] = useState(conexao?.listingQuota?.toString() ?? '');
  const [cotaDestaque, setCotaDestaque] = useState(conexao?.featuredQuota?.toString() ?? '');
  const [cotaSuper, setCotaSuper] = useState(conexao?.superFeaturedQuota?.toString() ?? '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setLigada(conexao?.enabled ?? false);
    setDestinos(conexao?.destinations ?? []);
    setConta(conexao?.externalAccountId ?? '');
    setCliente(conexao?.externalCustomerId ?? '');
    setCota(conexao?.listingQuota?.toString() ?? '');
    setCotaDestaque(conexao?.featuredQuota?.toString() ?? '');
    setCotaSuper(conexao?.superFeaturedQuota?.toString() ?? '');
  }, [conexao]);

  async function salvar() {
    setSalvando(true);
    try {
      await apiClient('/integrations/grupo-olx', {
        method: 'PUT',
        body: {
          enabled: ligada,
          destinations: destinos,
          externalAccountId: conta,
          externalCustomerId: cliente,
          listingQuota: inteiroOuNulo(cota),
          featuredQuota: inteiroOuNulo(cotaDestaque),
          superFeaturedQuota: inteiroOuNulo(cotaSuper),
        },
      });
      aoSalvar();
    } catch (err) {
      aoFalhar(err instanceof Error ? err.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card title="Conexão">
      <Stack gap={2}>
        <Switch
          label="Feed ligado"
          checked={ligada}
          onChange={(e) => {
            setLigada(e.target.checked);
          }}
        />
        <span className="peg-text-secondary" style={{ fontSize: 12 }}>
          Portais do contrato da imobiliária (informativo: quem decide é o plano no Grupo OLX).
        </span>
        <Group gap={3} wrap>
          {Object.entries(DESTINATION_LABELS).map(([valor, nome]) => (
            <Checkbox
              key={valor}
              label={nome}
              checked={destinos.includes(valor)}
              onChange={(e) => {
                setDestinos((atual) =>
                  e.target.checked ? [...atual, valor] : atual.filter((d) => d !== valor),
                );
              }}
            />
          ))}
        </Group>
        <Input
          label="Conta no Canal Pro"
          optional
          value={conta}
          onChange={(e) => {
            setConta(e.target.value);
          }}
        />
        <Input
          label="Código de anunciante"
          optional
          value={cliente}
          onChange={(e) => {
            setCliente(e.target.value);
          }}
        />
        <div className="peg-grid cols-3">
          <Input
            label="Cota de anúncios"
            optional
            inputMode="numeric"
            value={cota}
            onChange={(e) => {
              setCota(e.target.value);
            }}
          />
          <Input
            label="Destaques"
            optional
            inputMode="numeric"
            value={cotaDestaque}
            onChange={(e) => {
              setCotaDestaque(e.target.value);
            }}
          />
          <Input
            label="Super destaques"
            optional
            inputMode="numeric"
            value={cotaSuper}
            onChange={(e) => {
              setCotaSuper(e.target.value);
            }}
          />
        </div>
        <span className="peg-text-secondary" style={{ fontSize: 12 }}>
          Cotas do contrato com o Grupo OLX, informadas pela imobiliária: servem para avisar quando
          o feed passa delas. O excedente é desativado pelo Grupo OLX.
        </span>
        <Group gap={2}>
          <Button
            size="sm"
            variant="primary"
            loading={salvando}
            onClick={() => {
              void salvar();
            }}
          >
            Salvar conexão
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function FeedCard({
  conexao,
  feedDisponivel,
  aoMudar,
}: {
  conexao: Conexao | null;
  feedDisponivel: boolean;
  aoMudar: () => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [confirmarTroca, setConfirmarTroca] = useState(false);
  const [confirmarRevogar, setConfirmarRevogar] = useState(false);
  const [baixando, setBaixando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const res = await apiClient<{ feedUrl: string }>('/integrations/grupo-olx/feed-token', {
        method: 'POST',
      });
      setUrl(res.feedUrl);
      aoMudar();
    } catch (err) {
      toast.error('Não foi possível gerar a URL', err instanceof Error ? err.message : undefined);
    } finally {
      setGerando(false);
      setConfirmarTroca(false);
    }
  }

  async function revogar() {
    try {
      await apiClient('/integrations/grupo-olx/feed-token', { method: 'DELETE' });
      setUrl(null);
      toast.success('URL revogada', 'O Grupo OLX deixa de conseguir buscar o feed.');
      aoMudar();
    } catch (err) {
      toast.error('Não foi possível revogar', err instanceof Error ? err.message : undefined);
    } finally {
      setConfirmarRevogar(false);
    }
  }

  async function baixar() {
    setBaixando(true);
    try {
      const res = await fetch('/api/backend/integrations/grupo-olx/feed-preview.xml');
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const mensagem =
          typeof data === 'object' && data !== null && 'message' in data
            ? String((data as { message: unknown }).message)
            : 'Falha ao gerar o arquivo';
        toast.error('Não foi possível baixar', mensagem);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'grupo-olx-vrsync.xml';
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      toast.error('Não foi possível baixar', err instanceof Error ? err.message : undefined);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Card title="URL do feed">
      <Stack gap={3}>
        {!feedDisponivel ? (
          <span style={{ fontSize: 13 }}>
            Esta instalação ainda não tem o endereço público da API configurado; a URL do feed não
            pode ser gerada.
          </span>
        ) : null}
        {conexao?.feedToken ? (
          <span style={{ fontSize: 13 }}>
            Há uma URL ativa, terminada em <strong>…{conexao.feedToken.hint}.xml</strong>, gerada em{' '}
            {dataHora(conexao.feedToken.createdAt)}. Confira com a cadastrada no Canal Pro.
          </span>
        ) : (
          <span style={{ fontSize: 13 }}>Nenhuma URL gerada ainda.</span>
        )}
        {url ? (
          <Stack gap={1}>
            <Input label="URL do feed" readOnly value={url} />
            <span className="peg-text-secondary" style={{ fontSize: 12 }}>
              Copie agora: por segurança, a URL inteira não aparece de novo. Ela dá acesso ao
              endereço completo dos anúncios — cadastre só no Canal Pro, sem enviar por e-mail ou
              mensagem. Se perder ou vazar, gere outra (a anterior deixa de valer).
            </span>
            <Group gap={2}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(url).then(() => {
                    toast.success('URL copiada');
                  });
                }}
              >
                Copiar URL
              </Button>
            </Group>
          </Stack>
        ) : null}
        <Group gap={2} wrap>
          <Button
            size="sm"
            variant="primary"
            loading={gerando}
            disabled={!feedDisponivel}
            onClick={() => {
              if (conexao?.feedToken) {
                setConfirmarTroca(true);
              } else {
                void gerar();
              }
            }}
          >
            {conexao?.feedToken ? 'Gerar nova URL' : 'Gerar URL do feed'}
          </Button>
          {conexao?.feedToken ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setConfirmarRevogar(true);
              }}
            >
              Revogar URL
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            loading={baixando}
            disabled={!feedDisponivel}
            onClick={() => {
              void baixar();
            }}
          >
            Baixar arquivo para o validador
          </Button>
        </Group>
        <span className="peg-text-secondary" style={{ fontSize: 12 }}>
          O arquivo baixado pode ser conferido no validador oficial do Grupo OLX
          (developers.grupozap.com/feeds/xml_validator). O envio lá é manual.
        </span>
        <Stack gap={1}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>No Canal Pro</span>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {CANAL_PRO_PASSOS.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
        </Stack>
      </Stack>
      <ConfirmModal
        open={confirmarTroca}
        title="Gerar nova URL?"
        body="A URL atual deixa de funcionar na hora. Será preciso cadastrar a nova no Canal Pro."
        confirmLabel="Gerar nova URL"
        onConfirm={() => {
          void gerar();
        }}
        onClose={() => {
          setConfirmarTroca(false);
        }}
      />
      <ConfirmModal
        open={confirmarRevogar}
        title="Revogar a URL do feed?"
        body="O Grupo OLX deixa de conseguir buscar o arquivo. Os anúncios já importados ficam como estão no portal."
        danger
        confirmLabel="Revogar"
        onConfirm={() => {
          void revogar();
        }}
        onClose={() => {
          setConfirmarRevogar(false);
        }}
      />
    </Card>
  );
}

function AtencaoCard({
  linhas,
  carregando,
  aoAjustar,
}: {
  linhas: Linha[];
  carregando: boolean;
  aoAjustar: () => void;
}) {
  const [ajustando, setAjustando] = useState<Linha | null>(null);
  return (
    <Card title="Anúncios que precisam de atenção" padless>
      {carregando ? (
        <div style={{ padding: 16, fontSize: 13 }}>Carregando…</div>
      ) : linhas.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13 }} className="peg-text-secondary">
          Nenhum anúncio bloqueado nem recusado.
        </div>
      ) : (
        <Stack gap={0}>
          {linhas.map((linha) => (
            <div
              key={linha.listingId}
              style={{ padding: '12px 16px', borderBottom: '1px solid var(--peg-border)' }}
            >
              <Group between wrap>
                <Group gap={2}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{linha.title}</span>
                  <Badge tone={CHANNEL_STATUS_TONES[linha.status] ?? 'neutral'}>
                    {label(CHANNEL_STATUS_LABELS, linha.status)}
                  </Badge>
                </Group>
                <Button
                  size="xs"
                  variant="tertiary"
                  onClick={() => {
                    setAjustando(linha);
                  }}
                >
                  Ajustar tipo e destaque
                </Button>
              </Group>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                {linha.issues
                  .filter((issue) => issue.blocking)
                  .map((issue) => (
                    <li key={`${issue.code}:${issue.message}`}>{issue.message}</li>
                  ))}
              </ul>
            </div>
          ))}
        </Stack>
      )}
      <AjusteModal
        linha={ajustando}
        aoFechar={() => {
          setAjustando(null);
        }}
        aoSalvar={() => {
          setAjustando(null);
          aoAjustar();
        }}
      />
    </Card>
  );
}

function AjusteModal({
  linha,
  aoFechar,
  aoSalvar,
}: {
  linha: Linha | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const toast = useToast();
  const opcoesQ = useQuery<{ defaultType: string | null; options: string[] }>(
    linha ? `/integrations/grupo-olx/listings/${linha.listingId}/property-type-options` : null,
    [linha?.listingId],
  );
  const [tier, setTier] = useState('STANDARD');
  const [tipo, setTipo] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setTier(linha?.publicationTier ?? 'STANDARD');
    setTipo(linha?.portalPropertyType ?? '');
  }, [linha]);

  async function salvar() {
    if (!linha) return;
    setSalvando(true);
    try {
      const res = await apiClient<{ status: string }>(
        `/integrations/grupo-olx/listings/${linha.listingId}`,
        {
          method: 'PATCH',
          body: { publicationTier: tier, portalPropertyType: tipo === '' ? null : tipo },
        },
      );
      toast.success('Anúncio reavaliado', label(CHANNEL_STATUS_LABELS, res.status));
      aoSalvar();
    } catch (err) {
      toast.error('Não foi possível ajustar', err instanceof Error ? err.message : undefined);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={linha !== null}
      onClose={aoFechar}
      title="Ajustar no Grupo OLX"
      footer={
        <>
          <Button variant="tertiary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={salvando}
            onClick={() => {
              void salvar();
            }}
          >
            Salvar e reavaliar
          </Button>
        </>
      }
    >
      <Stack gap={3}>
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          {linha?.title}
        </span>
        <Select
          label="Destaque no Grupo OLX"
          value={tier}
          onChange={(e) => {
            setTier(e.target.value);
          }}
          options={Object.entries(PUBLICATION_TIER_LABELS).map(([value, text]) => ({
            value,
            label: text,
          }))}
        />
        <Select
          label="Tipo no Grupo OLX"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value);
          }}
          placeholder={
            opcoesQ.data?.defaultType
              ? `Padrão: ${label(PORTAL_PROPERTY_TYPE_LABELS, opcoesQ.data.defaultType)}`
              : 'Escolha o tipo'
          }
          options={(opcoesQ.data?.options ?? []).map((value) => ({
            value,
            label: label(PORTAL_PROPERTY_TYPE_LABELS, value),
          }))}
          helper="Os outros motivos (fotos, CEP, descrição) se resolvem no cadastro do imóvel e do anúncio."
        />
      </Stack>
    </Modal>
  );
}

export function GrupoOlxClient() {
  return (
    <ToastProvider>
      <GrupoOlxBody />
    </ToastProvider>
  );
}
