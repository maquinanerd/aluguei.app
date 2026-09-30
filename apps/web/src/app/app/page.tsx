import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';
import {
  fraseDasPendencias,
  larguras,
  linhaDaFila,
  saudacao,
  tipoDaDemanda,
} from '@/lib/visao-geral';
import type { CicloDaSemana, FilaDaVisao } from '@/lib/visao-geral';
import { Saudacao } from './saudacao';

export const metadata: Metadata = { title: 'Visão Geral' };
export const dynamic = 'force-dynamic';

interface MeDto {
  user: { id: string; name: string; email: string };
}

/** GET /reporting/demand-by-neighborhood?groupBy=type — só contagens (ADR-099, B14). */
interface DemandaPorBairro {
  city: string | null;
  cityLabel: string | null;
  totalActiveAlerts: number;
  rows: {
    neighborhoodSlug: string;
    neighborhood: string;
    purpose: 'RENT' | 'SALE';
    propertyType: string | null;
    bedrooms: number | null;
    count: number;
    published: number;
  }[];
}

/**
 * Resposta de GET /dashboard/summary (apps/api/src/routes/dashboard.ts). Seção
 * `null` = sem permissão de leitura: a tela mostra "—", nunca zero.
 */
interface DashboardSummaryDto {
  generatedAt: string;
  crm: {
    openLeads: number;
    newLeadsToday: number;
    leadsWithoutOwner: number;
    awaitingResponse: number;
    qualified: number;
  } | null;
  tasks: { overdue: number; dueToday: number } | null;
  properties: { available: number; archived: number; reserved: number } | null;
  listings: { publishedPublications: number; failedPublications: number } | null;
  screening: { total: number; pending: number } | null;
  contracts: { nonVoid: number; pending: number; awaitingSignature: number } | null;
  inspections: { open: number } | null;
  finance: {
    activeLeases: number;
    scheduledCharges: number;
    openCharges: number;
    overdueCharges: number;
    pendingPayouts: number;
  } | null;
  queue: FilaDaVisao;
  week: CicloDaSemana;
}

/** Cor do número quando ele pede atenção (01-painel.dc.html:225): âmbar ou vermelho. */
type Destaque = 'aviso' | 'perigo';

interface LinhaDoResumo {
  rotulo: string;
  valor: number | null;
  destaque?: Destaque;
}

/**
 * Visão Geral (tela 32, `telas/gestao/01-painel.dc.html#visao`; ADR-105, B14): quatro cartões de
 * resumo, a fila "Próximas ações", o ciclo de locação da semana e a demanda por bairro. Números
 * agregados no banco pela API (auditoria 2026-09-10, P1-01).
 */
export default async function OverviewPage() {
  let me: MeDto;
  try {
    me = await apiFetch<MeDto>('/auth/me');
  } catch {
    redirect('/login');
  }

  let summary: DashboardSummaryDto | null;
  try {
    summary = await apiFetch<DashboardSummaryDto>('/dashboard/summary');
  } catch {
    summary = null;
  }

  // Demanda por bairro (Onda 4). Falha aqui (ou falta de permissão de relatório) não derruba a
  // Visão Geral: o cartão some e o resto continua — é apoio, não operação.
  const demanda = await apiFetch<DemandaPorBairro>(
    '/reporting/demand-by-neighborhood?groupBy=type&limit=4',
  ).catch(() => null);

  const agora = summary === null ? new Date() : new Date(summary.generatedAt);
  const crm = summary?.crm ?? null;
  const tasks = summary?.tasks ?? null;
  const finance = summary?.finance ?? null;
  const fila = summary?.queue ?? null;
  const semana = summary?.week ?? null;
  const primeiroNome = me.user.name.split(' ')[0] ?? me.user.name;

  const cartoes: Array<{ titulo: string; href: string; linhas: LinhaDoResumo[] }> = [
    {
      titulo: 'CRM',
      href: '/app/crm/leads',
      linhas: [
        { rotulo: 'Novos leads hoje', valor: crm?.newLeadsToday ?? null },
        { rotulo: 'Sem atendimento', valor: crm?.leadsWithoutOwner ?? null, destaque: 'aviso' },
        { rotulo: 'Aguardando resposta', valor: crm?.awaitingResponse ?? null },
        { rotulo: 'Atividades atrasadas', valor: tasks?.overdue ?? null, destaque: 'perigo' },
      ],
    },
    {
      titulo: 'Imóveis',
      href: '/app/properties',
      linhas: [
        { rotulo: 'Disponíveis', valor: summary?.properties?.available ?? null },
        { rotulo: 'Publicações ativas', valor: summary?.listings?.publishedPublications ?? null },
        { rotulo: 'Arquivados', valor: summary?.properties?.archived ?? null },
        { rotulo: 'Reservados', valor: summary?.properties?.reserved ?? null },
      ],
    },
    {
      titulo: 'Operação',
      href: '/app/leases',
      linhas: [
        { rotulo: 'Crédito pendente', valor: summary?.screening?.pending ?? null },
        { rotulo: 'Contratos aguardando', valor: summary?.contracts?.pending ?? null },
        { rotulo: 'Vistorias em aberto', valor: summary?.inspections?.open ?? null },
        { rotulo: 'Locações ativas', valor: finance?.activeLeases ?? null },
      ],
    },
    {
      titulo: 'Financeiro',
      href: '/app/finance',
      linhas: [
        { rotulo: 'Cobranças agendadas', valor: finance?.scheduledCharges ?? null },
        { rotulo: 'Em aberto', valor: finance?.openCharges ?? null },
        { rotulo: 'Vencidas', valor: finance?.overdueCharges ?? null, destaque: 'perigo' },
        { rotulo: 'Repasses pendentes', valor: finance?.pendingPayouts ?? null },
      ],
    },
  ];

  const ciclo: Array<{ rotulo: string; valor: number | null }> = [
    { rotulo: 'Leads', valor: semana?.leads ?? null },
    { rotulo: 'Qualif.', valor: semana?.qualified ?? null },
    { rotulo: 'Visitas', valor: semana?.visits ?? null },
    { rotulo: 'Propostas', valor: semana?.proposals ?? null },
    { rotulo: 'Crédito', valor: semana?.screening ?? null },
    { rotulo: 'Contrato', valor: semana?.contracts ?? null },
    { rotulo: 'Locação', valor: semana?.leases ?? null },
  ];
  const larguraDoCiclo = larguras(ciclo.map((etapa) => etapa.valor));
  const linhasDaDemanda = demanda?.rows ?? [];
  const larguraDaDemanda = larguras(linhasDaDemanda.map((linha) => linha.count));

  return (
    <div className="app-page dash-page">
      <div className="dash-cabecalho">
        <div className="dash-cabecalho__texto">
          <Saudacao nome={primeiroNome} inicial={saudacao(agora)} />
          <p className="dash-sub">
            {fila === null
              ? 'Não foi possível carregar os indicadores agora.'
              : fraseDasPendencias(fila.attention)}
          </p>
        </div>
        <div className="dash-cabecalho__acoes">
          <Link href="/app/crm/calendar" className="dash-botao">
            Minha agenda
          </Link>
          <Link href="/app/properties/new" className="dash-botao dash-botao--primario">
            + Novo imóvel
          </Link>
        </div>
      </div>

      <div className="dash-grid">
        {cartoes.map((cartao) => (
          <section key={cartao.titulo} className="dash-summary">
            <Link href={cartao.href} className="dash-summary__header">
              <h2 className="dash-summary__title">{cartao.titulo}</h2>
              <span className="dash-seta" aria-hidden="true">
                ›
              </span>
            </Link>
            <div className="dash-summary__body">
              {cartao.linhas.map((linha) => (
                <div key={linha.rotulo} className="dash-summary__row">
                  <span className="dash-summary__label">{linha.rotulo}</span>
                  <span
                    className={
                      linha.destaque !== undefined && (linha.valor ?? 0) > 0
                        ? `dash-summary__value dash-summary__value--${linha.destaque}`
                        : 'dash-summary__value'
                    }
                  >
                    {contagem(linha.valor)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="dash-main">
        <section className="dash-card dash-fila">
          <header className="dash-fila__cabecalho">
            <div>
              <h2 className="dash-card__titulo">Próximas ações · minha fila</h2>
              <p className="dash-card__nota">
                {fila === null ? '—' : String(fila.total)} item(ns) exigem atenção
              </p>
            </div>
            <Link href="/app/crm/tasks" className="dash-link">
              Ver tarefas
            </Link>
          </header>
          {fila === null || fila.items.length === 0 ? (
            <p className="dash-fila__vazia">
              {fila === null ? 'Fila indisponível no momento.' : 'Nada pendente agora.'}
            </p>
          ) : (
            <ul className="dash-fila__lista">
              {fila.items.map((item) => {
                const linha = linhaDaFila(item, agora);
                return (
                  <li key={linha.chave}>
                    <Link href={linha.href} className="dash-fila__linha">
                      <span
                        className={`dash-fila__ponto dash-fila__ponto--${linha.tom}`}
                        aria-hidden="true"
                      />
                      <span className="dash-fila__tipo">{linha.tipo}</span>
                      <span className="dash-fila__titulo">{linha.titulo}</span>
                      <span className="dash-fila__meta">{linha.meta}</span>
                      <span className="dash-fila__prazo">{linha.prazo}</span>
                      <span className="dash-seta" aria-hidden="true">
                        ›
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="dash-coluna">
          <section className="dash-card">
            <h2 className="dash-card__cabecalho dash-card__titulo">
              Ciclo de locação · esta semana
            </h2>
            <div className="dash-barras dash-barras--ciclo">
              {ciclo.map((etapa, indice) => (
                <div key={etapa.rotulo} className="dash-barra dash-barra--ciclo">
                  <span className="dash-barra__rotulo">{etapa.rotulo}</span>
                  <span className="dash-barra__trilho" aria-hidden="true">
                    <span
                      className="dash-barra__preenchido"
                      style={{ width: larguraDoCiclo[indice] }}
                    />
                  </span>
                  <span className="dash-barra__numero">{contagem(etapa.valor)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Demanda por bairro (Onda 4): o que as pessoas procuram no portal. Só contagem — o
              contato de quem criou o alerta nunca sai do portal. */}
          {demanda === null ? null : (
            <section className="dash-card dash-demanda">
              <header className="dash-demanda__cabecalho">
                <h2 className="dash-card__titulo dash-demanda__titulo">
                  Demanda por bairro <span className="dash-selo">Novo</span>
                </h2>
                <span className="dash-card__nota">alertas ativos no portal</span>
              </header>
              <div className="dash-barras dash-barras--demanda">
                {demanda.city === null ? (
                  <p className="dash-demanda__vazia">
                    Publique um anúncio para ver o que procuram nos seus bairros.
                  </p>
                ) : linhasDaDemanda.length === 0 ? (
                  <p className="dash-demanda__vazia">
                    Ninguém criou alerta nos seus bairros ainda.
                  </p>
                ) : (
                  linhasDaDemanda.map((linha, indice) => (
                    <div
                      key={`${linha.neighborhoodSlug}-${linha.purpose}-${linha.propertyType ?? ''}-${String(linha.bedrooms)}`}
                      className="dash-barra dash-barra--demanda"
                    >
                      <span className="dash-barra__texto">
                        <span className="dash-barra__bairro">{linha.neighborhood}</span>{' '}
                        <span className="dash-barra__tipo">· {tipoDaDemanda(linha)}</span>
                      </span>
                      <span className="dash-barra__trilho" aria-hidden="true">
                        <span
                          className="dash-barra__preenchido dash-barra__preenchido--neutro"
                          style={{ width: larguraDaDemanda[indice] }}
                        />
                      </span>
                      <span className="dash-barra__numero">{linha.count}</span>
                    </div>
                  ))
                )}
                <p className="dash-demanda__nota">
                  Só contagens. O contato de quem criou o alerta nunca aparece.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Contagem conhecida ou "—" (sem permissão ou API indisponível): nunca um zero inventado. */
function contagem(valor: number | null): string {
  return valor === null ? '—' : String(valor);
}
