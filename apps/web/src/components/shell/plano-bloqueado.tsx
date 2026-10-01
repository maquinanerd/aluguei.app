'use client';

import { useEffect, useState } from 'react';
import type { PlanModule } from '@aluguei/domain';
import { apiClient } from '@/lib/api-client';
import {
  NOME_DO_MODULO,
  O_QUE_O_MODULO_TEM,
  UPGRADE_ACAO,
  UPGRADE_ITENS,
  fraseDeUpgrade,
} from '@/lib/plan-modules';
import type { SessionPlan } from '@/lib/session';
import { CadeadoDoPlano } from './nav-icon';

export interface PlanoBloqueadoProps {
  /** Módulo pedido; ausente quando a pessoa chega sem contexto. */
  modulo: PlanModule | null;
  plano: SessionPlan | null;
  /** Item do menu que a pessoa abriu ("Locações"), para o título. */
  item?: string | null;
  /** Imobiliária ativa, dona do pedido de troca de plano. */
  orgId?: string | null;
  /** Quem administra a imobiliária pode pedir a troca (`member:manage`). */
  podePedir?: boolean;
  /** Endereço do portal, para "Comparar planos". */
  portalUrl?: string | null;
  /** Tela existe mas ainda não foi construída. */
  emPreparacao?: boolean;
  /** Planos públicos já conhecidos (a tela busca `/public/plans` de qualquer jeito). */
  planosIniciais?: readonly PlanoPublico[] | null;
  /** Pedido de troca em aberto já conhecido. */
  pedidoInicial?: PedidoDeTroca | null;
}

export interface PlanoPublico {
  code: string;
  name: string;
  modules: PlanModule[];
  /** Centavos; nulo é "Fale com a gente". */
  monthlyPriceCents?: number | null;
}

/**
 * O plano que a tela oferece quando mais de um inclui o módulo: o mais barato com preço público
 * (o sem preço vai por último), depois o de menos módulos e, no empate, o código.
 */
export function planoQueAbre(
  planos: readonly PlanoPublico[],
  modulo: PlanModule,
): PlanoPublico | null {
  const preco = (plano: PlanoPublico) => plano.monthlyPriceCents ?? Number.POSITIVE_INFINITY;
  return (
    planos
      .filter((plano) => plano.modules.includes(modulo))
      .sort(
        (a, b) =>
          preco(a) - preco(b) ||
          a.modules.length - b.modules.length ||
          a.code.localeCompare(b.code),
      )[0] ?? null
  );
}

export interface PedidoDeTroca {
  id: string;
  status: 'PENDING' | 'DONE' | 'DISMISSED';
  createdAt: string;
}

const DATA_CURTA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/**
 * Tela de upgrade no lugar do módulo fora do plano (tela 33, `01-painel.dc.html#upgrade`). Serve
 * para o clique no item com cadeado, que abre a própria rota do módulo, e para o 403
 * `PLAN_MODULE_NOT_INCLUDED` que a API devolve (ADR-095). "Pedir o …" registra o pedido de troca
 * (B15); quem troca o plano é a equipe da plataforma, e a tela não promete e-mail (D6).
 */
export function PlanoBloqueado({
  modulo,
  plano,
  item = null,
  orgId = null,
  podePedir = false,
  portalUrl = null,
  emPreparacao = false,
  planosIniciais = null,
  pedidoInicial = null,
}: PlanoBloqueadoProps) {
  const [planos, setPlanos] = useState<readonly PlanoPublico[] | null>(planosIniciais);
  const [pedido, setPedido] = useState<PedidoDeTroca | null>(pedidoInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    apiClient<{ plans: PlanoPublico[] }>('/public/plans')
      .then((res) => {
        if (!cancelado) setPlanos(res.plans);
      })
      .catch(() => {
        if (!cancelado) setPlanos([]);
      });
    if (orgId !== null) {
      apiClient<{ requests: PedidoDeTroca[] }>(`/organizations/${orgId}/plan-change-requests`)
        .then((res) => {
          if (!cancelado) setPedido(res.requests.find((r) => r.status === 'PENDING') ?? null);
        })
        .catch(() => {
          /* sem a lista, o botão continua pedindo; a API devolve o pedido aberto */
        });
    }
    return () => {
      cancelado = true;
    };
  }, [orgId]);

  if (emPreparacao || modulo === null) {
    const nome = modulo ? NOME_DO_MODULO[modulo] : 'Este módulo';
    return (
      <div className="upgrade">
        <div className="upgrade__cartao">
          <h1 className="upgrade__titulo">
            {emPreparacao ? `${nome} está em preparação` : 'Esta parte está fora do seu plano'}
          </h1>
          <p className="upgrade__texto">
            {modulo ? O_QUE_O_MODULO_TEM[modulo] : null} Nada do que você já usa muda.
          </p>
        </div>
      </div>
    );
  }

  const alvo = planos ? planoQueAbre(planos, modulo) : null;
  const nomeDoAlvo = alvo?.name ?? null;
  const atual = plano?.name ?? null;
  const resumoDoAtual =
    plano && plano.modules.length === 0
      ? 'você publica nos portais e recebe os leads'
      : 'você já usa o que o seu plano inclui';

  async function pedir() {
    if (orgId === null || modulo === null) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await apiClient<{ request: PedidoDeTroca }>(
        `/organizations/${orgId}/plan-change-requests`,
        { method: 'POST', body: { module: modulo } },
      );
      setPedido(res.request);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para registrar o pedido agora');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="upgrade">
      <div className="upgrade__cartao">
        <span className="upgrade__selo">
          <CadeadoDoPlano />
          Fora do seu plano
        </span>
        <h1 className="upgrade__titulo">
          {fraseDeUpgrade(item, modulo)}
          {nomeDoAlvo ? ` no AchouImóvel ${nomeDoAlvo}` : ' em outro plano'}
        </h1>
        <p className="upgrade__texto">
          {atual ? `No plano ${atual} ${resumoDoAtual}. ` : null}
          {nomeDoAlvo
            ? `Com o ${nomeDoAlvo}, o mesmo painel passa a ${UPGRADE_ACAO[modulo]}.`
            : `Com o módulo ${NOME_DO_MODULO[modulo]}, o mesmo painel passa a ${UPGRADE_ACAO[modulo]}.`}{' '}
          Nada do que você já tem muda.
        </p>
        <ul className="upgrade__lista">
          {UPGRADE_ITENS[modulo].map((texto) => (
            <li key={texto}>
              <span className="upgrade__marca" aria-hidden="true">
                ✓
              </span>
              {texto}
            </li>
          ))}
        </ul>

        {pedido ? (
          <p className="upgrade__pedido" role="status">
            Pedido registrado em {DATA_CURTA.format(new Date(pedido.createdAt))}. A equipe
            AchouImóvel vê o pedido e faz a troca de plano.
          </p>
        ) : null}

        <div className="upgrade__acoes">
          {podePedir && !pedido ? (
            <button
              type="button"
              className="upgrade__botao upgrade__botao--principal"
              disabled={enviando}
              aria-busy={enviando || undefined}
              onClick={() => {
                void pedir();
              }}
            >
              {nomeDoAlvo ? `Pedir o ${nomeDoAlvo}` : 'Pedir a troca de plano'}
            </button>
          ) : null}
          {portalUrl ? (
            <a
              className="upgrade__botao upgrade__botao--secundario"
              href={`${portalUrl}/planos`}
              target="_blank"
              rel="noopener"
            >
              Comparar planos
            </a>
          ) : null}
        </div>
        {erro ? (
          <p className="upgrade__erro" role="alert">
            {erro}
          </p>
        ) : null}

        <p className="upgrade__nota">
          {podePedir
            ? 'A troca de plano é feita pela equipe AchouImóvel.'
            : 'A troca de plano é feita pela equipe AchouImóvel, a pedido de quem administra a imobiliária.'}
        </p>
      </div>
    </div>
  );
}
