/**
 * Ciclo de vida da visita e da proposta na interface (auditoria 2026-09-10, P2-02). Espelha
 * packages/domain/src/crm/visit.ts e proposal.ts sem importar o pacote de domínio no bundle do
 * cliente; crm-lifecycle.test.ts compara com o domínio. Datas civis são strings `AAAA-MM-DD`.
 */

export type VisitStatus = 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'NO_SHOW';
export type ProposalStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface LifecycleAction<S extends string> {
  to: S;
  label: string;
  tone: 'brand' | 'secondary' | 'danger';
  needsReason: boolean;
  needsValidity: boolean;
}

const VISIT_ACTIONS: Record<string, ReadonlyArray<LifecycleAction<VisitStatus>>> = {
  SCHEDULED: [
    {
      to: 'CONFIRMED',
      label: 'Confirmar',
      tone: 'brand',
      needsReason: false,
      needsValidity: false,
    },
    {
      to: 'DONE',
      label: 'Marcar realizada',
      tone: 'secondary',
      needsReason: false,
      needsValidity: false,
    },
    {
      to: 'NO_SHOW',
      label: 'Não compareceu',
      tone: 'secondary',
      needsReason: false,
      needsValidity: false,
    },
    { to: 'CANCELLED', label: 'Cancelar', tone: 'danger', needsReason: true, needsValidity: false },
  ],
  CONFIRMED: [
    {
      to: 'DONE',
      label: 'Marcar realizada',
      tone: 'brand',
      needsReason: false,
      needsValidity: false,
    },
    {
      to: 'NO_SHOW',
      label: 'Não compareceu',
      tone: 'secondary',
      needsReason: false,
      needsValidity: false,
    },
    { to: 'CANCELLED', label: 'Cancelar', tone: 'danger', needsReason: true, needsValidity: false },
  ],
};

/** Transições da visita oferecidas na tela (o reagendamento tem ação própria). */
export function visitActions(status: string): ReadonlyArray<LifecycleAction<VisitStatus>> {
  return VISIT_ACTIONS[status] ?? [];
}

/** Agendada e confirmada aceitam nova data. */
export function canRescheduleVisit(status: string): boolean {
  return status === 'SCHEDULED' || status === 'CONFIRMED';
}

const PROPOSAL_ACTIONS: Record<string, ReadonlyArray<LifecycleAction<ProposalStatus>>> = {
  DRAFT: [{ to: 'SENT', label: 'Enviar', tone: 'brand', needsReason: false, needsValidity: true }],
  SENT: [
    { to: 'ACCEPTED', label: 'Aceitar', tone: 'brand', needsReason: false, needsValidity: false },
    { to: 'REJECTED', label: 'Recusar', tone: 'danger', needsReason: true, needsValidity: false },
  ],
};

/** Transições da proposta oferecidas na tela (expirar é do worker). */
export function proposalActions(status: string): ReadonlyArray<LifecycleAction<ProposalStatus>> {
  return PROPOSAL_ACTIONS[status] ?? [];
}

/** Só o rascunho aceita mudança de valor, condições e validade. */
export function proposalEditable(status: string): boolean {
  return status === 'DRAFT';
}

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function civilDateExists(value: string): boolean {
  const match = CIVIL_DATE.exec(value);
  if (!match) {
    return false;
  }
  const [, year = '', month = '', day = ''] = match;
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    check.getUTCFullYear() === Number(year) &&
    check.getUTCMonth() === Number(month) - 1 &&
    check.getUTCDate() === Number(day)
  );
}

/**
 * Valor do `<input type="date">` como data civil, sem passar por `new Date` (que viraria meia-noite
 * UTC e, em São Paulo, o dia anterior). Vazio ou fora do formato → `null`.
 */
export function civilDateFromInput(value: string): string | null {
  const trimmed = value.trim();
  return CIVIL_DATE.test(trimmed) ? trimmed : null;
}

/** Erro da validade para enviar a proposta: data que existe, de hoje em diante. */
export function proposalValidityError(value: string, today: string): string | null {
  const date = civilDateFromInput(value);
  if (date === null) {
    return 'Informe a validade';
  }
  if (!civilDateExists(date)) {
    return 'Data inexistente';
  }
  if (date < today) {
    return 'A validade precisa ser hoje ou uma data futura';
  }
  return null;
}

/**
 * Validade para exibição. Só a proposta enviada "vence": a validade é o último dia em que ela vale,
 * então vence a partir do dia seguinte (mesma regra de `isProposalExpired` no domínio).
 */
export function proposalValidityLabel(
  status: string,
  validUntil: string | null,
  today: string,
): { text: string; expired: boolean } {
  if (!validUntil || !civilDateExists(validUntil)) {
    return { text: '—', expired: false };
  }
  const [year, month, day] = validUntil.split('-');
  const text = `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
  return { text, expired: status === 'SENT' && today > validUntil };
}
