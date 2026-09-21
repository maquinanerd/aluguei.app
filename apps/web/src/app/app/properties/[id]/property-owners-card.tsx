'use client';

import { useState } from 'react';
import {
  AsyncCombobox,
  Button,
  Card,
  ConfirmModal,
  Group,
  Icon,
  IconButton,
  Input,
  Modal,
  Stack,
  useToast,
} from '@aluguei/ui';
import type { ComboboxOption } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { searchParties } from '@/lib/lookup';
import { ownershipCheck, ownershipExceedsTotal, parseOwnerSharePct } from '@/lib/property-owners';
import type { OwnerShare } from '@/lib/property-owners';

export interface PropertyOwner extends OwnerShare {
  name: string;
}

/**
 * Proprietários do imóvel com a participação de cada um (auditoria 2026-09-10, P1-08): a locação
 * divide o repasse pelas participações e só é criada com elas somando 100%.
 */
export function PropertyOwnersCard({
  propertyId,
  owners,
  onChanged,
}: {
  propertyId: string;
  owners: readonly PropertyOwner[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PropertyOwner | null>(null);
  const [busy, setBusy] = useState(false);
  const check = ownershipCheck(owners);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await apiClient(`/properties/${propertyId}/owners/${removing.partyId}`, {
        method: 'DELETE',
      });
      toast.success('Proprietário removido');
      setRemoving(null);
      onChanged();
    } catch (err) {
      toast.error('Não foi possível remover', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Proprietários"
      padless
      actions={
        <Button
          size="xs"
          variant="secondary"
          icon={<Icon name="plus" size={12} />}
          onClick={() => {
            setAdding(true);
          }}
        >
          Adicionar proprietário
        </Button>
      }
    >
      {owners.length > 0 ? (
        <Stack gap={0}>
          {owners.map((owner) => (
            <Group
              key={owner.partyId}
              gap={3}
              style={{ padding: '10px 16px', borderBottom: '1px solid var(--peg-border)' }}
            >
              <Icon name="user" size={14} />
              <span className="peg-grow" style={{ fontSize: 13 }}>
                {owner.name}
              </span>
              <span
                className={owner.ownershipSharePct === null ? 'peg-text-tertiary' : undefined}
                style={{ fontSize: 13, fontWeight: owner.ownershipSharePct === null ? 400 : 600 }}
              >
                {owner.ownershipSharePct === null
                  ? 'sem participação'
                  : `${String(owner.ownershipSharePct)}%`}
              </span>
              <IconButton
                label={`Remover ${owner.name}`}
                size="sm"
                onClick={() => {
                  setRemoving(owner);
                }}
              >
                <Icon name="trash" size={14} />
              </IconButton>
            </Group>
          ))}
        </Stack>
      ) : null}
      {check.message ? (
        <div
          role="status"
          className="peg-group"
          style={{
            gap: 8,
            padding: '10px 16px',
            background: 'var(--peg-surface-subtle)',
            color: check.readyForLease ? undefined : 'var(--peg-warning)',
          }}
        >
          <Icon name={check.readyForLease ? 'info' : 'alertTriangle'} size={14} />
          <span style={{ fontSize: 13 }}>{check.message}</span>
        </div>
      ) : null}

      {adding ? (
        <AddOwnerModal
          propertyId={propertyId}
          owners={owners}
          onClose={() => {
            setAdding(false);
          }}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
        />
      ) : null}
      <ConfirmModal
        open={removing !== null}
        onClose={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          void remove();
        }}
        title="Remover proprietário"
        body={`Remover ${removing?.name ?? ''} deste imóvel? Locações já criadas mantêm as participações registradas nelas.`}
        confirmLabel="Remover"
        danger
        loading={busy}
      />
    </Card>
  );
}

function AddOwnerModal({
  propertyId,
  owners,
  onClose,
  onAdded,
}: {
  propertyId: string;
  owners: readonly PropertyOwner[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [party, setParty] = useState<ComboboxOption | null>(null);
  const [share, setShare] = useState('');
  const [partyError, setPartyError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const parsed = parseOwnerSharePct(share);
    const nextPartyError = party
      ? owners.some((owner) => owner.partyId === party.value)
        ? 'Esta pessoa já é proprietária do imóvel.'
        : null
      : 'Escolha a pessoa.';
    const nextShareError = parsed.ok ? ownershipExceedsTotal(owners, parsed.pct) : parsed.error;
    setPartyError(nextPartyError);
    setShareError(nextShareError);
    if (!party || !parsed.ok || nextPartyError || nextShareError) {
      return;
    }
    setBusy(true);
    try {
      await apiClient(`/properties/${propertyId}/owners`, {
        method: 'POST',
        body:
          parsed.pct === null
            ? { partyId: party.value }
            : { partyId: party.value, ownershipSharePct: parsed.pct },
      });
      toast.success('Proprietário adicionado');
      onAdded();
    } catch (err) {
      // Conflito da API (soma acima de 100% ou vínculo repetido) aparece no campo.
      setShareError(err instanceof Error ? err.message : 'Não foi possível adicionar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar proprietário"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="add-owner-form" loading={busy}>
            Adicionar
          </Button>
        </>
      }
    >
      <form
        id="add-owner-form"
        className="peg-stack"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <AsyncCombobox
          label="Pessoa"
          required
          value={party}
          onChange={(option) => {
            setParty(option);
            setPartyError(null);
          }}
          loadOptions={searchParties}
          placeholder="Buscar pelo nome, CPF, CNPJ ou telefone…"
          {...(partyError ? { error: partyError } : {})}
        />
        <Input
          label="Participação (%)"
          optional
          inputMode="numeric"
          value={share}
          onChange={(e) => {
            setShare(e.target.value);
            setShareError(null);
          }}
          helper="Com mais de um proprietário, as participações precisam somar 100% para criar a locação."
          {...(shareError ? { error: shareError } : {})}
        />
      </form>
    </Modal>
  );
}
