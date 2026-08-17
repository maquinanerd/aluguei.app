import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  contractParties,
  contracts,
  leads,
  rentalApplications,
  signatureEnvelopes,
} from '@aluguei/db';
import { AUDIT_ACTIONS, transitionContract, transitionLead } from '@aluguei/domain';
import type { ContractStatus } from '@aluguei/domain';
import { writeAudit } from '@aluguei/api/audit';

export interface SignatureJob {
  id: string;
  orgId: string;
  payload: Record<string, unknown>;
}

interface EnvelopeRow {
  id: string;
  orgId: string;
  contractId: string;
  provider: string;
  providerEnvelopeId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Processa evento de webhook de assinatura: atualiza envelope + partes + contrato.
 * Idempotente (dedup por UNIQUE provider_event_id no insert).
 *
 * Reconciliação de eventos fora de ordem: o COMPLETED pode chegar ANTES dos
 * SIGNER_SIGNED (o envelope só converge quando TODOS os signatários assinam).
 * Por isso o SIGNER_SIGNED do último signatário reavalia o envelope e, se
 * todos os signOrder assinaram, finaliza o contrato (idempotente) — mesma
 * lógica do COMPLETED.
 */
export async function processSignatureJob(db: AppDb, job: SignatureJob): Promise<void> {
  const envelopeId = typeof job.payload['envelopeId'] === 'string' ? job.payload['envelopeId'] : '';
  const eventType =
    typeof job.payload['eventType'] === 'string' ? job.payload['eventType'] : 'FAILED';
  const signerOrder =
    typeof job.payload['signerOrder'] === 'number' ? job.payload['signerOrder'] : undefined;
  if (!envelopeId) {
    throw new Error('job sem envelopeId');
  }
  const [envelope] = await db
    .select()
    .from(signatureEnvelopes)
    .where(and(eq(signatureEnvelopes.id, envelopeId), eq(signatureEnvelopes.orgId, job.orgId)))
    .limit(1);
  if (!envelope) {
    return; // envelope removido
  }

  if (eventType === 'SIGNER_SIGNED' && signerOrder !== undefined) {
    const [party] = await db
      .select()
      .from(contractParties)
      .where(
        and(
          eq(contractParties.contractId, envelope.contractId),
          eq(contractParties.signOrder, signerOrder),
        ),
      )
      .limit(1);
    if (party && !party.signedAt) {
      await db
        .update(contractParties)
        .set({ signedAt: new Date() })
        .where(eq(contractParties.id, party.id));
    }
    // Não rebaixa um envelope já finalizado (SIGNED/FAILED) por evento tardio.
    if (envelope.status !== 'SIGNED' && envelope.status !== 'FAILED') {
      await db
        .update(signatureEnvelopes)
        .set({ status: 'PARTIALLY_SIGNED', updatedAt: new Date() })
        .where(eq(signatureEnvelopes.id, envelope.id));
    }
    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, envelope.contractId))
      .limit(1);
    if (contract && contract.status === 'SENT_FOR_SIGNATURE') {
      await db
        .update(contracts)
        .set({ status: 'PARTIALLY_SIGNED', updatedAt: new Date() })
        .where(eq(contracts.id, contract.id));
    }
    // Reavaliação (ordem fora de sequência): se TODOS os signatários já
    // assinaram, o envelope está efetivamente finalizado (auto_close) →
    // convergir para SIGNED (idempotente).
    await maybeFinalizeWhenAllSigned(db, envelope, job.orgId);
  }

  if (eventType === 'COMPLETED') {
    await maybeFinalizeWhenAllSigned(db, envelope, job.orgId);
  }

  if (eventType === 'FAILED') {
    await db
      .update(signatureEnvelopes)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(eq(signatureEnvelopes.id, envelope.id));
  }
}

/** Finaliza o contrato (SIGNED) apenas quando todos os signatários assinaram. */
async function maybeFinalizeWhenAllSigned(
  db: AppDb,
  envelope: EnvelopeRow,
  orgId: string,
): Promise<void> {
  const partiesRows = await db
    .select()
    .from(contractParties)
    .where(eq(contractParties.contractId, envelope.contractId));
  const allSigned = partiesRows.length > 0 && partiesRows.every((p) => p.signedAt !== null);
  if (!allSigned) {
    return;
  }
  await finalizeContractSigned(db, envelope, orgId);
}

/** Transição contrato/envelope → SIGNED + auditoria + lead WON (idempotente). */
async function finalizeContractSigned(
  db: AppDb,
  envelope: EnvelopeRow,
  orgId: string,
): Promise<void> {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, envelope.contractId))
    .limit(1);
  if (!contract) {
    return;
  }
  if (contract.status === 'SIGNED') {
    // Idempotente: garante apenas que o envelope permaneça coerente.
    await db
      .update(signatureEnvelopes)
      .set({ status: 'SIGNED', updatedAt: new Date() })
      .where(eq(signatureEnvelopes.id, envelope.id));
    return;
  }
  // SENT_FOR_SIGNATURE → PARTIALLY_SIGNED → SIGNED são os saltos válidos;
  // outros estados (DRAFT/GENERATED/VOID) rejeitados pela transição do domínio.
  const from: ContractStatus =
    contract.status === 'SENT_FOR_SIGNATURE'
      ? 'PARTIALLY_SIGNED'
      : (contract.status as ContractStatus);
  transitionContract(from, 'SIGNED', {
    hasContentAndHash: true,
    hasEnvelope: true,
    allPartiesSigned: true,
  });
  await db
    .update(contracts)
    .set({ status: 'SIGNED', signedAt: new Date(), updatedAt: new Date() })
    .where(eq(contracts.id, envelope.contractId));
  await db
    .update(signatureEnvelopes)
    .set({ status: 'SIGNED', updatedAt: new Date() })
    .where(eq(signatureEnvelopes.id, envelope.id));
  await writeAudit(db, {
    orgId,
    action: AUDIT_ACTIONS.CONTRACT_SIGNED,
    entityType: 'CONTRACT',
    entityId: envelope.contractId,
  });
  // Lead WON
  if (contract.applicationId) {
    const [application] = await db
      .select()
      .from(rentalApplications)
      .where(eq(rentalApplications.id, contract.applicationId))
      .limit(1);
    if (application?.leadId) {
      const [lead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, application.leadId), eq(leads.orgId, orgId)))
        .limit(1);
      if (lead) {
        try {
          const next = transitionLead(lead.status as never, 'WON');
          await db
            .update(leads)
            .set({ status: next, updatedAt: new Date() })
            .where(eq(leads.id, lead.id));
        } catch {
          // transição inválida — ignora
        }
      }
    }
  }
}
