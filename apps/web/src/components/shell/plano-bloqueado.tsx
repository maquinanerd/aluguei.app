import { Badge, Card, Icon } from '@aluguei/ui';
import type { PlanModule } from '@aluguei/domain';
import { NOME_DO_MODULO, O_QUE_O_MODULO_TEM } from '@/lib/plan-modules';
import type { SessionPlan } from '@/lib/session';

export interface PlanoBloqueadoProps {
  /** Módulo pedido; ausente quando a pessoa chega sem contexto. */
  modulo: PlanModule | null;
  plano: SessionPlan | null;
  /** Tela existe mas ainda não foi construída (fase de Vendas, ADR-097). */
  emPreparacao?: boolean;
}

/**
 * Tela "Fora do seu plano" (entrega de design · gestao/01-painel · upgrade).
 * Serve para o clique no item com cadeado e para o 403
 * `PLAN_MODULE_NOT_INCLUDED` que a API devolve (ADR-095).
 */
export function PlanoBloqueado({ modulo, plano, emPreparacao = false }: PlanoBloqueadoProps) {
  const nome = modulo ? NOME_DO_MODULO[modulo] : null;

  return (
    <div className="app-page">
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name={emPreparacao ? 'clock' : 'lock'} size={18} />
            <h1 style={{ margin: 0, fontSize: 20 }}>
              {emPreparacao
                ? `${nome ?? 'Este módulo'} está em preparação`
                : `${nome ?? 'Este módulo'} está fora do seu plano`}
            </h1>
          </span>

          {modulo ? <p style={{ margin: 0 }}>{O_QUE_O_MODULO_TEM[modulo]}</p> : null}

          <p style={{ margin: 0 }}>
            {emPreparacao
              ? 'As telas deste módulo ainda não foram entregues. Enquanto isso, nada muda no que você já usa.'
              : 'Para abrir esta parte do sistema, a imobiliária precisa de um plano que inclua o módulo. Nada do que você já usa muda.'}
          </p>

          {plano ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--peg-text-secondary)' }}>
                Plano atual: <strong>{plano.name}</strong>
              </span>
              <span
                style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
                aria-label="Módulos incluídos no plano"
              >
                {plano.modules.length > 0 ? (
                  plano.modules.map((m) => (
                    <Badge key={m} tone="brand">
                      {NOME_DO_MODULO[m]}
                    </Badge>
                  ))
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--peg-text-secondary)' }}>
                    Só anúncios no portal e caixa de leads.
                  </span>
                )}
              </span>
            </div>
          ) : null}

          <p style={{ margin: 0, fontSize: 13, color: 'var(--peg-text-secondary)' }}>
            Quem troca o plano é a equipe da plataforma. Fale com quem cuida da sua conta para pedir
            a mudança.
          </p>
        </div>
      </Card>
    </div>
  );
}
