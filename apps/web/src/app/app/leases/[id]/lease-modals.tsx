'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Modal,
  MoneyInput,
  Radio,
  Select,
  Stack,
  Textarea,
  useToast,
} from '@aluguei/ui';
import { formatBRL, formatDate } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import {
  endOutcome,
  formatBps,
  LEASE_INDEX_OPTIONS,
  parseLeaseEnd,
  parseLeaseTerms,
  parsePercentBps,
  parseReadjustment,
  parseRenewal,
  readjustedRentPreview,
  rentForPeriodPreview,
  renewalRentStartsAt,
  saoPauloToday,
} from '@/lib/lease-rules';
import type { FieldErrors, RentChange } from '@/lib/lease-rules';

/**
 * Diálogos da locação (auditoria 2026-09-10, G3 trilha C): encargos e vencimento (P1-07) e
 * renovação, reajuste e encerramento (P1-20). A validação espelha o domínio (lease-rules.ts); a
 * API continua sendo a autoridade e a mensagem dela aparece no aviso de erro.
 */

export interface LeaseForModals {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  monthlyRentCents: number;
  lateFeeBps: number;
  interestMonthlyBps: number;
  dueDay: number;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  lease: LeaseForModals;
  onSaved: () => void;
}

function errorMessage(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

function monthLabel(month: string): string {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

/** Percentual para o campo do formulário: 250 → "2,5". */
function bpsForInput(bps: number): string {
  return formatBps(bps).replace('%', '');
}

export function LeaseTermsModal({ open, onClose, lease, onSaved }: ModalProps) {
  const toast = useToast();
  const [lateFee, setLateFee] = useState(bpsForInput(lease.lateFeeBps));
  const [interest, setInterest] = useState(bpsForInput(lease.interestMonthlyBps));
  const [dueDay, setDueDay] = useState(String(lease.dueDay));
  const [errors, setErrors] = useState<FieldErrors<'lateFee' | 'interest' | 'dueDay'>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const parsed = parseLeaseTerms({ lateFee, interest, dueDay });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await apiClient(`/leases/${lease.id}/terms`, { method: 'PATCH', body: parsed.value });
      toast.success('Encargos atualizados');
      onSaved();
    } catch (err) {
      toast.error('Não foi possível salvar os encargos', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Encargos e vencimento"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="lease-terms-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="lease-terms-form"
        className="peg-stack"
        style={{ gap: 16 }}

        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <div className="peg-grid cols-2">
          <Input
            label="Multa por atraso (%)"
            inputMode="decimal"
            value={lateFee}
            onChange={(e) => {
              setLateFee(e.target.value);
            }}
            helper="Até 10%. Padrão: 2%."
            {...(errors.lateFee ? { error: errors.lateFee } : {})}
          />
          <Input
            label="Juros de mora (% ao mês)"
            inputMode="decimal"
            value={interest}
            onChange={(e) => {
              setInterest(e.target.value);
            }}
            helper="Até 1% ao mês, pro rata die. Padrão: 1%."
            {...(errors.interest ? { error: errors.interest } : {})}
          />
        </div>
        <Input
          label="Dia de vencimento"
          inputMode="numeric"
          value={dueDay}
          onChange={(e) => {
            setDueDay(e.target.value);
          }}
          helper="De 1 a 28. Em fim de semana ou feriado nacional, vale até o próximo dia útil."
          {...(errors.dueDay ? { error: errors.dueDay } : {})}
        />
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Vale para as cobranças geradas a partir de agora e para o recálculo no pagamento.
        </span>
      </form>
    </Modal>
  );
}

export function RenewLeaseModal({ open, onClose, lease, onSaved }: ModalProps) {
  const toast = useToast();
  const [endDate, setEndDate] = useState('');
  const [newRentCents, setNewRentCents] = useState<number | null>(null);
  const [errors, setErrors] = useState<FieldErrors<'endDate' | 'newRent'>>({});
  const [busy, setBusy] = useState(false);
  const rentStartsAt = renewalRentStartsAt(lease.endDate, saoPauloToday());

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const parsed = parseRenewal({
      startDate: lease.startDate,
      currentEndDate: lease.endDate,
      endDate,
      newRentCents,
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await apiClient(`/leases/${lease.id}/renew`, { method: 'POST', body: parsed.value });
      toast.success('Locação renovada');
      onSaved();
    } catch (err) {
      toast.error('Não foi possível renovar', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Renovar locação"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="lease-renew-form" loading={busy}>
            Renovar
          </Button>
        </>
      }
    >
      <form
        id="lease-renew-form"
        className="peg-stack"
        style={{ gap: 16 }}

        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          Término atual: {lease.endDate ? formatDate(lease.endDate) : 'sem data'}.
        </span>
        <Input
          label="Novo término"
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
          }}
          {...(errors.endDate ? { error: errors.endDate } : {})}
        />
        <MoneyInput
          label="Novo aluguel (R$)"
          optional
          valueCents={newRentCents}
          onValueChange={setNewRentCents}
          helper={`Sem valor, o aluguel continua o mesmo. Com valor, vale a partir de ${monthLabel(rentStartsAt)}.`}
          {...(errors.newRent ? { error: errors.newRent } : {})}
        />
      </form>
    </Modal>
  );
}

export function ReadjustLeaseModal({
  open,
  onClose,
  lease,
  onSaved,
  rentChanges,
}: ModalProps & { rentChanges: readonly RentChange[] }) {
  const toast = useToast();
  const [month, setMonth] = useState(renewalRentStartsAt(null, saoPauloToday()).slice(0, 7));
  const [indexName, setIndexName] = useState('IGPM');
  const [mode, setMode] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [percent, setPercent] = useState('');
  const [newRentCents, setNewRentCents] = useState<number | null>(null);
  const [errors, setErrors] = useState<FieldErrors<'month' | 'indexName' | 'percent' | 'newRent'>>(
    {},
  );
  const [busy, setBusy] = useState(false);

  // Base do reajuste: o aluguel do mês escolhido pelo histórico, como a API calcula.
  const baseRentCents = /^d{4}-d{2}$/.test(month)
    ? rentForPeriodPreview(lease.monthlyRentCents, rentChanges, `${month}-01`)
    : lease.monthlyRentCents;
  const previewBps = mode === 'PERCENT' ? parsePercentBps(percent) : null;
  const preview = previewBps !== null ? readjustedRentPreview(baseRentCents, previewBps) : null;

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const parsed = parseReadjustment({
      startDate: lease.startDate,
      endDate: lease.endDate,
      month,
      indexName,
      mode,
      percent,
      newRentCents,
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await apiClient(`/leases/${lease.id}/readjust`, { method: 'POST', body: parsed.value });
      toast.success('Reajuste registrado');
      onSaved();
    } catch (err) {
      toast.error('Não foi possível reajustar', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reajustar aluguel"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="lease-readjust-form" loading={busy}>
            Reajustar
          </Button>
        </>
      }
    >
      <form
        id="lease-readjust-form"
        className="peg-stack"
        style={{ gap: 16 }}

        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <span className="peg-text-secondary" style={{ fontSize: 13 }}>
          Aluguel antes do reajuste: {formatBRL(baseRentCents)}. O reajuste vale a partir do
          primeiro dia do mês escolhido; cobranças de meses anteriores mantêm o valor.
        </span>
        <div className="peg-grid cols-2">
          <Input
            label="A partir de"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
            }}
            {...(errors.month ? { error: errors.month } : {})}
          />
          <Select
            label="Índice"
            value={indexName}
            onChange={(e) => {
              setIndexName(e.target.value);
            }}
            options={LEASE_INDEX_OPTIONS}
            {...(errors.indexName ? { error: errors.indexName } : {})}
          />
        </div>
        <fieldset className="peg-stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="peg-field__label">Como reajustar</legend>
          <ChoiceRow>
            <Radio
              name="readjust-mode"
              label="Pela variação do índice"
              checked={mode === 'PERCENT'}
              onChange={() => {
                setMode('PERCENT');
              }}
            />
            <Radio
              name="readjust-mode"
              label="Pelo novo valor"
              checked={mode === 'AMOUNT'}
              onChange={() => {
                setMode('AMOUNT');
              }}
            />
          </ChoiceRow>
        </fieldset>
        {mode === 'PERCENT' ? (
          <Stack gap={1}>
            <Input
              label="Variação (%)"
              inputMode="decimal"
              placeholder="4,52"
              value={percent}
              onChange={(e) => {
                setPercent(e.target.value);
              }}
              helper="Acumulado do índice no período; negativo reduz o aluguel."
              {...(errors.percent ? { error: errors.percent } : {})}
            />
            {preview !== null ? (
              <span role="status" style={{ fontSize: 13 }}>
                Novo aluguel: {formatBRL(preview)}
              </span>
            ) : null}
          </Stack>
        ) : (
          <MoneyInput
            label="Novo aluguel (R$)"
            valueCents={newRentCents}
            onValueChange={setNewRentCents}
            {...(errors.newRent ? { error: errors.newRent } : {})}
          />
        )}
      </form>
    </Modal>
  );
}

function ChoiceRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="peg-group" style={{ gap: 16, flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

export function EndLeaseModal({ open, onClose, lease, onSaved }: ModalProps) {
  const toast = useToast();
  const [endDate, setEndDate] = useState(lease.endDate ?? '');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'endDate' | 'reason'>>({});
  const [busy, setBusy] = useState(false);
  const today = saoPauloToday();

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const parsed = parseLeaseEnd({ startDate: lease.startDate, endDate, reason });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await apiClient(`/leases/${lease.id}/end`, { method: 'POST', body: parsed.value });
      toast.success('Encerramento registrado');
      onSaved();
    } catch (err) {
      toast.error('Não foi possível encerrar', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= lease.startDate;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Encerrar locação"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" form="lease-end-form" loading={busy}>
            Encerrar locação
          </Button>
        </>
      }
    >
      <form
        id="lease-end-form"
        className="peg-stack"
        style={{ gap: 16 }}

        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <Input
          label="Data de término"
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
          }}
          {...(errors.endDate ? { error: errors.endDate } : {})}
        />
        <Textarea
          label="Motivo"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
          {...(errors.reason ? { error: errors.reason } : {})}
        />
        {validDate ? (
          <span role="status" style={{ fontSize: 13 }}>
            {endOutcome(endDate, today) === 'ENDED'
              ? 'A data já passou: a locação é encerrada agora.'
              : `A locação fica em encerramento até ${formatDate(endDate)}; depois disso, é encerrada automaticamente.`}
          </span>
        ) : null}
        <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
          Cobranças agendadas ou abertas de meses depois do término, sem pagamento iniciado, são
          canceladas. Cobranças vencidas ou com pagamento em andamento continuam com a equipe.
        </span>
      </form>
    </Modal>
  );
}
