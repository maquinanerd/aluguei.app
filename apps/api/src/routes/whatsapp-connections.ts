import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { decryptSecret, encryptSecret } from '@aluguei/config';
import { whatsappConnections } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  canVerifyWhatsAppConnection,
  decideWhatsAppClaim,
  whatsappClaimExpiresAt,
} from '@aluguei/domain';
import type { WhatsAppClaimConflict } from '@aluguei/domain';
import { FakeWhatsAppNumberVerifier, WhatsAppProviderError } from '@aluguei/integrations';
import type { WhatsAppConnectionInfo } from '@aluguei/integrations';
import {
  createWhatsAppConnectionRequestSchema,
  listWhatsAppConnectionsResponseSchema,
  uuidSchema,
  whatsAppConnectionSchema,
} from '@aluguei/contracts';
import { writeAudit } from '../plugins/audit.js';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { first } from './helpers.js';

type ConnectionRow = typeof whatsappConnections.$inferSelect;

const ENTITY = 'WHATSAPP_CONNECTION';

/** Mensagens do 409 da reivindicação: nenhuma revela qual organização tem o número. */
const CLAIM_CONFLICT_MESSAGES: Record<WhatsAppClaimConflict, string> = {
  VERIFIED_HERE: 'Este número já está verificado nesta organização',
  VERIFIED_ELSEWHERE: 'Este número já está verificado em outra organização',
  PENDING_ELSEWHERE:
    'Este número aguarda verificação em outra organização; tente de novo quando a reivindicação vencer',
  DISABLED_ELSEWHERE: 'Este número não está disponível para esta organização',
};

const OWNERSHIP_NOT_PROVEN = 'Não foi possível comprovar a posse do número com este token';

function metadataText(row: ConnectionRow, key: string): string | null {
  const value = (row.metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/** DTO da conexão: o token (cifrado ou não) nunca sai da API. */
function toConnectionDto(row: ConnectionRow): unknown {
  return whatsAppConnectionSchema.parse({
    id: row.id,
    orgId: row.orgId,
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.businessAccountId,
    status: row.status,
    claimExpiresAt: row.claimExpiresAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedName: metadataText(row, 'verifiedName'),
    displayPhoneNumber: metadataText(row, 'displayPhoneNumber'),
    createdAt: row.createdAt.toISOString(),
  });
}

function verifiedMetadata(row: ConnectionRow | null, info: WhatsAppConnectionInfo): object {
  return {
    ...((row?.metadata as Record<string, unknown> | undefined) ?? {}),
    verifiedName: info.verifiedName ?? null,
    displayPhoneNumber: info.displayPhoneNumber ?? null,
  };
}

/**
 * Conexões do WhatsApp com prova de posse do número (auditoria 2026-09-10, P1-18, segunda parte).
 *
 * - `POST /whatsapp/connections` reivindica o número com o token da conta do WhatsApp Business da
 *   própria organização (cifrado como o token da Meta Ads, ADR-028). A conexão nasce PENDING, com
 *   prazo de 24 h, e não recebe webhook. A própria organização troca o token enquanto pendente.
 *   Número verificado não é reivindicado por ninguém (409). Reivindicação pendente de outra
 *   organização: 409 no prazo; vencida, é tomada só com a prova de posse feita no próprio pedido.
 * - `POST /whatsapp/connections/:id/verify` confere o número na Graph API com o token da conexão
 *   (verificador FAKE em dry_run: nenhuma chamada real em teste e homologação).
 */
export const whatsappConnectionRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  function encryptionKey(): string {
    const key = app.env.META_TOKEN_ENCRYPTION_KEY;
    if (!key) {
      throw new DomainError(
        'INVALID_INPUT',
        'META_TOKEN_ENCRYPTION_KEY ausente: sem ela o token da conexão não é guardado',
      );
    }
    return key;
  }

  function sealToken(token: string): { accessTokenEncrypted: string; tokenKeyId: string } {
    const encrypted = encryptSecret(token, encryptionKey());
    return {
      accessTokenEncrypted: `${encrypted.keyId}:${encrypted.iv}:${encrypted.value}`,
      tokenKeyId: encrypted.keyId,
    };
  }

  function openToken(row: ConnectionRow): string {
    const [keyId, iv, value] = (row.accessTokenEncrypted ?? '').split(':');
    if (!keyId || !iv || !value) {
      throw new DomainError('CONFLICT', 'Token da conexão ilegível; informe o token de novo');
    }
    return decryptSecret({ keyId, iv, value }, encryptionKey());
  }

  /**
   * Confere o número na Graph API com o token da conexão. Falha grava
   * `whatsapp.connection_verification_failed` (sem o token) e responde 409 — ou 502 quando a
   * falha é transitória do lado da Meta.
   */
  async function proveOwnership(input: {
    orgId: string;
    actorUserId: string;
    entityId: string;
    phoneNumberId: string;
    accessToken: string;
    log: FastifyBaseLogger;
  }): Promise<WhatsAppConnectionInfo> {
    const verifier = app.whatsappVerifier;
    if (!verifier) {
      throw new DomainError('PROVIDER_ERROR', 'WhatsApp não configurado neste ambiente');
    }
    const fail = async (payload: Record<string, unknown>): Promise<void> => {
      await writeAudit(db, {
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.WHATSAPP_CONNECTION_VERIFICATION_FAILED,
        entityType: ENTITY,
        entityId: input.entityId,
        payload: { phoneNumberId: input.phoneNumberId, ...payload },
      });
    };
    let info: WhatsAppConnectionInfo;
    try {
      info = await verifier.verifyNumber({
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
      });
    } catch (error) {
      const providerError = error instanceof WhatsAppProviderError ? error : null;
      const retryable = providerError ? providerError.retryable : true;
      input.log.warn(
        {
          phoneNumberId: input.phoneNumberId,
          providerStatus: providerError?.status,
          providerCode: providerError?.providerCode,
          retryable,
        },
        'whatsapp: verificação do número falhou',
      );
      await fail({
        reason: retryable ? 'PROVIDER_UNAVAILABLE' : 'NOT_OWNER',
        providerStatus: providerError?.status ?? null,
        providerCode: providerError?.providerCode ?? null,
      });
      if (retryable) {
        throw new DomainError('PROVIDER_ERROR', 'A Meta não respondeu; tente de novo em instantes');
      }
      throw new DomainError('CONFLICT', OWNERSHIP_NOT_PROVEN);
    }
    if (info.phoneNumberId !== input.phoneNumberId) {
      await fail({ reason: 'PHONE_NUMBER_MISMATCH' });
      throw new DomainError('CONFLICT', OWNERSHIP_NOT_PROVEN);
    }
    return info;
  }

  app.get(
    '/whatsapp/connections',
    { onRequest: [requirePermission('org:manage')] },
    async (request) => {
      const auth = requireAuth(request);
      const rows = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.orgId, auth.orgId));
      const verifier = app.whatsappVerifier;
      return listWhatsAppConnectionsResponseSchema.parse({
        connections: rows.map((row) => toConnectionDto(row)),
        verifier: verifier
          ? verifier instanceof FakeWhatsAppNumberVerifier
            ? 'FAKE'
            : 'META'
          : null,
      });
    },
  );

  app.post(
    '/whatsapp/connections',
    { onRequest: [requirePermission('org:manage')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createWhatsAppConnectionRequestSchema.parse(request.body);
      const sealed = sealToken(input.accessToken);
      const claimed = (row: ConnectionRow, extra: object): Parameters<typeof writeAudit>[1] => ({
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.WHATSAPP_CONNECTION_CLAIMED,
        entityType: ENTITY,
        entityId: row.id,
        payload: { phoneNumberId: row.phoneNumberId, ...extra },
      });

      // 1. Decide com a linha do número travada (duas reivindicações não decidem juntas).
      const outcome = await db.transaction(async (tx) => {
        const now = new Date();
        const [holder] = await tx
          .select()
          .from(whatsappConnections)
          .where(eq(whatsappConnections.phoneNumberId, input.phoneNumberId))
          .limit(1)
          .for('update');
        const decision = decideWhatsAppClaim(holder ?? null, auth.orgId, now);
        if (decision.kind === 'CREATE') {
          // Sem linha para travar: duas criações simultâneas esbarram no UNIQUE do número, e a
          // segunda responde 409 (23505).
          const row = first(
            await tx
              .insert(whatsappConnections)
              .values({
                orgId: auth.orgId,
                phoneNumberId: input.phoneNumberId,
                businessAccountId: input.businessAccountId ?? null,
                status: 'PENDING',
                claimExpiresAt: whatsappClaimExpiresAt(now),
                ...sealed,
              })
              .returning(),
          );
          await writeAudit(tx, claimed(row, { renewed: false, takeover: false }));
          return { kind: 'created' as const, row };
        }
        if (decision.kind === 'RENEW_OWN' && holder) {
          const row = first(
            await tx
              .update(whatsappConnections)
              .set({
                status: 'PENDING',
                claimExpiresAt: whatsappClaimExpiresAt(now),
                verifiedAt: null,
                businessAccountId: input.businessAccountId ?? holder.businessAccountId,
                updatedAt: now,
                ...sealed,
              })
              .where(eq(whatsappConnections.id, holder.id))
              .returning(),
          );
          await writeAudit(tx, claimed(row, { renewed: true, takeover: false }));
          return { kind: 'renewed' as const, row };
        }
        if (decision.kind === 'TAKE_OVER_EXPIRED' && holder) {
          return { kind: 'takeover' as const, holderId: holder.id };
        }
        return {
          kind: 'conflict' as const,
          reason: decision.kind === 'CONFLICT' ? decision.reason : 'PENDING_ELSEWHERE',
        };
      });

      if (outcome.kind === 'created') {
        return reply.status(201).send({ connection: toConnectionDto(outcome.row) });
      }
      if (outcome.kind === 'renewed') {
        return reply.status(200).send({ connection: toConnectionDto(outcome.row) });
      }
      if (outcome.kind === 'conflict') {
        await writeAudit(db, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.WHATSAPP_CONNECTION_CLAIM_REFUSED,
          entityType: ENTITY,
          entityId: input.phoneNumberId,
          payload: { phoneNumberId: input.phoneNumberId, reason: outcome.reason },
        });
        throw new DomainError('CONFLICT', CLAIM_CONFLICT_MESSAGES[outcome.reason]);
      }

      // 2. Reivindicação vencida de outra organização: só toma quem prova a posse, e a prova
      // (chamada externa) fica fora da transação.
      const info = await proveOwnership({
        orgId: auth.orgId,
        actorUserId: auth.userId,
        entityId: input.phoneNumberId,
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
        log: request.log,
      });

      // 3. Toma o número se a reivindicação ainda for a mesma e continuar vencida.
      const taken = await db.transaction(async (tx) => {
        const now = new Date();
        const [current] = await tx
          .select()
          .from(whatsappConnections)
          .where(eq(whatsappConnections.phoneNumberId, input.phoneNumberId))
          .limit(1)
          .for('update');
        if (
          !current ||
          current.id !== outcome.holderId ||
          decideWhatsAppClaim(current, auth.orgId, now).kind !== 'TAKE_OVER_EXPIRED'
        ) {
          return null;
        }
        await tx.delete(whatsappConnections).where(eq(whatsappConnections.id, current.id));
        // A organização que perdeu a reivindicação fica sabendo, sem saber quem tomou.
        await writeAudit(tx, {
          orgId: current.orgId,
          action: AUDIT_ACTIONS.WHATSAPP_CONNECTION_CLAIM_EXPIRED,
          entityType: ENTITY,
          entityId: current.id,
          payload: { phoneNumberId: current.phoneNumberId },
        });
        const row = first(
          await tx
            .insert(whatsappConnections)
            .values({
              orgId: auth.orgId,
              phoneNumberId: input.phoneNumberId,
              businessAccountId: input.businessAccountId ?? null,
              status: 'VERIFIED',
              claimExpiresAt: null,
              verifiedAt: now,
              metadata: verifiedMetadata(null, info),
              ...sealed,
            })
            .returning(),
        );
        await writeAudit(tx, claimed(row, { renewed: false, takeover: true }));
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.WHATSAPP_CONNECTION_VERIFIED,
          entityType: ENTITY,
          entityId: row.id,
          payload: { phoneNumberId: row.phoneNumberId },
        });
        return row;
      });
      if (!taken) {
        throw new DomainError(
          'CONFLICT',
          'O número mudou de situação durante a verificação; consulte e tente de novo',
        );
      }
      return reply.status(201).send({ connection: toConnectionDto(taken) });
    },
  );

  app.post(
    '/whatsapp/connections/:id/verify',
    { onRequest: [requirePermission('org:manage')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [row] = await db
        .select()
        .from(whatsappConnections)
        .where(and(eq(whatsappConnections.id, id), eq(whatsappConnections.orgId, auth.orgId)))
        .limit(1);
      if (!row) {
        throw new DomainError('NOT_FOUND', 'Conexão não encontrada');
      }
      if (row.status === 'VERIFIED') {
        return { connection: toConnectionDto(row) }; // idempotente
      }
      if (!canVerifyWhatsAppConnection(row.status)) {
        throw new DomainError(
          'CONFLICT',
          'Conexão desativada: informe o token de novo para reivindicar o número',
        );
      }
      if (!row.accessTokenEncrypted) {
        throw new DomainError(
          'CONFLICT',
          'Informe o token da conta do WhatsApp Business para verificar este número',
        );
      }
      const info = await proveOwnership({
        orgId: auth.orgId,
        actorUserId: auth.userId,
        entityId: row.id,
        phoneNumberId: row.phoneNumberId,
        accessToken: openToken(row),
        log: request.log,
      });

      // Compare-and-set: só vira VERIFIED se continuar PENDING, desta organização e com o
      // mesmo token que foi conferido (troca de token ou tomada no meio do caminho → 409).
      const verified = await db.transaction(async (tx) => {
        const now = new Date();
        const [done] = await tx
          .update(whatsappConnections)
          .set({
            status: 'VERIFIED',
            verifiedAt: now,
            claimExpiresAt: null,
            metadata: verifiedMetadata(row, info),
            updatedAt: now,
          })
          .where(
            and(
              eq(whatsappConnections.id, row.id),
              eq(whatsappConnections.orgId, auth.orgId),
              eq(whatsappConnections.status, 'PENDING'),
              eq(whatsappConnections.accessTokenEncrypted, row.accessTokenEncrypted ?? ''),
            ),
          )
          .returning();
        if (!done) {
          return null;
        }
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.WHATSAPP_CONNECTION_VERIFIED,
          entityType: ENTITY,
          entityId: done.id,
          payload: { phoneNumberId: done.phoneNumberId },
        });
        return done;
      });
      if (verified) {
        return { connection: toConnectionDto(verified) };
      }
      const [current] = await db
        .select()
        .from(whatsappConnections)
        .where(and(eq(whatsappConnections.id, row.id), eq(whatsappConnections.orgId, auth.orgId)))
        .limit(1);
      if (current?.status === 'VERIFIED') {
        return { connection: toConnectionDto(current) }; // verificação simultânea da mesma org
      }
      throw new DomainError(
        'CONFLICT',
        'A conexão mudou durante a verificação; consulte e tente de novo',
      );
    },
  );

  return Promise.resolve();
};
