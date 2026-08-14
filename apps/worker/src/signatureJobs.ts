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
import { writeAudit } from '@aluguei/api/audit';

export interface SignatureJob {
  id: string;
  orgId: string;
  payload: Record<string, unknown>;
}

/**
 * Processa evento de webhook de assinatura: atualiza envelope + partes + contrato.
 * Idempotente (dedup por UNIQUE provider_event_id no insert).
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
    await db
      .update(signatureEnvelopes)
      .set({ status: 'PARTIALLY_SIGNED', updatedAt: new Date() })
      .where(eq(signatureEnvelopes.id, envelope.id));
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
  }

  if (eventType === 'COMPLETED') {
    const partiesRows = await db
      .select()
      .from(contractParties)
      .where(eq(contractParties.contractId, envelope.contractId));
    const allSigned = partiesRows.length > 0 && partiesRows.every((p) => p.signedAt !== null);
    if (allSigned) {
      transitionContract('PARTIALLY_SIGNED', 'SIGNED', {
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
        orgId: job.orgId,
        action: AUDIT_ACTIONS.CONTRACT_SIGNED,
        entityType: 'CONTRACT',
        entityId: envelope.contractId,
      });
      // Lead WON
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, envelope.contractId))
        .limit(1);
      if (contract?.applicationId) {
        const [application] = await db
          .select()
          .from(rentalApplications)
          .where(eq(rentalApplications.id, contract.applicationId))
          .limit(1);
        if (application?.leadId) {
          const [lead] = await db
            .select()
            .from(leads)
            .where(and(eq(leads.id, application.leadId), eq(leads.orgId, job.orgId)))
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
  }

  if (eventType === 'FAILED') {
    await db
      .update(signatureEnvelopes)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(eq(signatureEnvelopes.id, envelope.id));
  }
}
