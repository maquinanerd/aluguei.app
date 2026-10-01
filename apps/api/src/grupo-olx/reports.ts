import { and, eq, inArray, lte } from 'drizzle-orm';
import {
  channelConnections,
  channelImportReports,
  listingChannelPublications,
  listings,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { isChannelPublicationStatus, nextFeedStatus } from '@aluguei/domain';
import type { GrupoOlxListingIssue } from '@aluguei/contracts';
import { grupoOlxReportPayloadSchema, normalizeGrupoOlxReport } from '@aluguei/integrations';
import type { NormalizedGrupoOlxReport, ReportCritique } from '@aluguei/integrations';
import { GRUPO_OLX_CHANNEL } from './feed-data.js';

/** Provider da caixa de entrada para o relatório de importação (ADR-108). */
export const GRUPO_OLX_REPORT_PROVIDER = 'GRUPO_OLX_REPORT';
/** Único tipo de relatório documentado. */
export const GRUPO_OLX_REPORT_TYPE = 'FEEDS_INTEGRATION_REPORT';

/** Prefixo dos motivos que vêm do relatório (os da avaliação local têm outros códigos). */
const REPORT_ISSUE_PREFIX = 'REPORT_';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportRouting =
  { ok: true; orgId: string } | { ok: false; status: 404 | 422; code: string; message: string };

/**
 * A qual imobiliária o relatório pertence. O payload não traz o anunciante: vale a URL por
 * imobiliária (se a homologação pedir) ou os anúncios citados nas críticas. Relatório sem crítica
 * e sem URL por imobiliária não tem dono identificável — e o Grupo OLX não reenvia relatório.
 */
export async function routeGrupoOlxReport(
  db: AppDb,
  report: NormalizedGrupoOlxReport,
  ref: string | null,
): Promise<ReportRouting> {
  if (ref !== null) {
    const [connection] = await db
      .select({ orgId: channelConnections.orgId })
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.leadsEndpointRef, ref),
          eq(channelConnections.channel, GRUPO_OLX_CHANNEL),
        ),
      )
      .limit(1);
    return connection
      ? { ok: true, orgId: connection.orgId }
      : { ok: false, status: 404, code: 'NOT_FOUND', message: 'Endpoint desconhecido' };
  }
  const ids = report.externalIds.filter((id) => UUID.test(id));
  const owners =
    ids.length > 0
      ? await db
          .selectDistinct({ orgId: listings.orgId })
          .from(listings)
          .where(inArray(listings.id, ids))
          .limit(2)
      : [];
  if (owners.length === 1 && owners[0]) {
    return { ok: true, orgId: owners[0].orgId };
  }
  return {
    ok: false,
    status: 422,
    code: owners.length > 1 ? 'MIXED_ADVERTISERS' : 'ADVERTISER_NOT_FOUND',
    message:
      owners.length > 1
        ? 'O relatório cita anúncios de mais de uma imobiliária'
        : 'Relatório sem anunciante identificável',
  };
}

function critiquesFor(list: ReportCritique[], listingId: string): string[] {
  return list.filter((item) => item.externalIds.includes(listingId)).map((item) => item.message);
}

function issuesWithReport(
  current: unknown,
  errors: string[],
  warnings: string[],
): GrupoOlxListingIssue[] {
  const local = (Array.isArray(current) ? (current as GrupoOlxListingIssue[]) : []).filter(
    (issue) => !issue.code.startsWith(REPORT_ISSUE_PREFIX),
  );
  return [
    ...local,
    ...errors.map((message) => ({ code: 'REPORT_ERROR', message, blocking: true })),
    ...warnings.map((message) => ({ code: 'REPORT_WARNING', message, blocking: false })),
  ];
}

/**
 * Processa um relatório da caixa de entrada (worker): guarda o histórico e atualiza o estado
 * **real** dos anúncios — crítica vira IMPORT_ERROR, aviso vira IMPORTED_WITH_WARNINGS, e quem o
 * robô levou antes da data do relatório sem ser citado vira IMPORTED. O mesmo relatório duas vezes
 * não faz nada na segunda.
 */
export async function processGrupoOlxReport(
  db: AppDb,
  orgId: string,
  payload: unknown,
): Promise<{ applied: boolean }> {
  const report = normalizeGrupoOlxReport(grupoOlxReportPayloadSchema.parse(payload));
  const now = new Date();
  const cutoff = report.reportDate ?? now;
  return db.transaction(async (tx) => {
    const [connection] = await tx
      .select({ id: channelConnections.id })
      .from(channelConnections)
      .where(
        and(eq(channelConnections.orgId, orgId), eq(channelConnections.channel, GRUPO_OLX_CHANNEL)),
      )
      .limit(1);
    const inserted = await tx
      .insert(channelImportReports)
      .values({
        orgId,
        connectionId: connection?.id ?? null,
        channel: GRUPO_OLX_CHANNEL,
        externalReportId: report.externalReportId,
        company: report.company,
        reportDate: report.reportDate,
        receivedAt: now,
        contracted: report.contracted,
        created: report.created,
        updated: report.updated,
        deleted: report.deleted,
        unchanged: report.unchanged,
        errorCount: report.errorCount,
        warningCount: report.warningCount,
        link: report.link,
        errors: report.errors,
        warnings: report.warnings,
      })
      .onConflictDoNothing({
        target: [
          channelImportReports.orgId,
          channelImportReports.channel,
          channelImportReports.externalReportId,
        ],
      })
      .returning({ id: channelImportReports.id });
    if (inserted.length === 0) {
      return { applied: false };
    }

    const cited = new Set(report.externalIds);
    // Citados no relatório, desta imobiliária e ainda desejados no portal.
    const citedRows =
      cited.size > 0
        ? await tx
            .select()
            .from(listingChannelPublications)
            .where(
              and(
                eq(listingChannelPublications.orgId, orgId),
                eq(listingChannelPublications.channel, GRUPO_OLX_CHANNEL),
                inArray(
                  listingChannelPublications.listingId,
                  [...cited].filter((id) => UUID.test(id)),
                ),
              ),
            )
        : [];
    // Levados pelo robô antes do relatório e não citados: importados sem crítica.
    const awaiting = await tx
      .select()
      .from(listingChannelPublications)
      .where(
        and(
          eq(listingChannelPublications.orgId, orgId),
          eq(listingChannelPublications.channel, GRUPO_OLX_CHANNEL),
          inArray(listingChannelPublications.status, [
            'AWAITING_IMPORT',
            'IMPORT_ERROR',
            'IMPORTED_WITH_WARNINGS',
          ]),
          lte(listingChannelPublications.lastInFeedAt, cutoff),
        ),
      );

    const rows = new Map([...awaiting, ...citedRows].map((row) => [row.id, row]));
    for (const row of rows.values()) {
      if (!isChannelPublicationStatus(row.status)) continue;
      const errors = critiquesFor(report.errors, row.listingId);
      const warnings = critiquesFor(report.warnings, row.listingId);
      const outcome = errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'OK';
      const next = nextFeedStatus(row.status, { kind: 'REPORT', outcome });
      await tx
        .update(listingChannelPublications)
        .set({
          status: next,
          issues: issuesWithReport(row.issues, errors, warnings),
          lastReportAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(listingChannelPublications.id, row.id),
            eq(listingChannelPublications.status, row.status),
          ),
        );
    }

    const errorCount = report.errorCount ?? report.errors.length;
    await tx
      .update(channelConnections)
      .set({
        lastReportAt: now,
        ...(errorCount > 0
          ? {
              lastErrorAt: now,
              lastErrorCode: 'IMPORT_REPORT_ERRORS',
              lastErrorMessage: `${String(errorCount)} anúncio(s) com erro no último relatório do Grupo OLX`,
            }
          : { lastSuccessAt: now }),
        updatedAt: now,
      })
      .where(
        and(eq(channelConnections.orgId, orgId), eq(channelConnections.channel, GRUPO_OLX_CHANNEL)),
      );
    return { applied: true };
  });
}
