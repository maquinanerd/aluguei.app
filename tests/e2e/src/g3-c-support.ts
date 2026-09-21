import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { api, poll, registerViaApi, uniq } from './g2-b1-support';
import {
  seedApprovedApplication,
  seedApprovedTemplate,
  seedParty,
  seedReadyProperty,
  VALID_CPFS,
} from './g2-b2-support';
import type { IdBody } from './g2-b2-support';

/**
 * Sementes e datas da trilha C do G3 (locação: encargos, coproprietários, renovação, reajuste e
 * encerramento). Datas civis no fuso de São Paulo, como a API e o painel.
 */

const saoPaulo = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoje em São Paulo, `AAAA-MM-DD`. */
export function spToday(): string {
  return saoPaulo.format(new Date());
}

/** Mês `AAAA-MM` deslocado de `months` a partir do mês de hoje em São Paulo. */
export function spMonth(months: number): string {
  const today = spToday();
  const date = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + months, 1),
  );
  return date.toISOString().slice(0, 7);
}

/** Último dia do mês `AAAA-MM`. */
export function lastDayOf(month: string): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  return date.toISOString().slice(0, 10);
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`. */
export function brDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Card do painel pelo título. */
export function card(page: Page, title: string): Locator {
  return page.locator('section.peg-card', { has: page.getByRole('heading', { name: title }) });
}

/**
 * Contrato assinado pelo webhook FAKE com `signers` signatários: cada proprietário do imóvel assina,
 * além do inquilino (o `seedSignedContract` do G2 assina dois, o caso de proprietário único).
 */
async function seedContractSignedBy(
  cookie: string,
  applicationId: string,
  templateId: string,
  signers: number,
): Promise<string> {
  const contract = await api<{ contract: IdBody }>('POST', '/contracts', {
    cookie,
    json: { applicationId, templateId },
  });
  expect(contract.status).toBe(201);
  const contractId = contract.body.contract.id;
  expect(
    (await api('POST', `/contracts/${contractId}/generate`, { cookie, json: {} })).status,
  ).toBe(200);
  const send = await api<{ envelope: { providerEnvelopeId: string } }>(
    'POST',
    `/contracts/${contractId}/send-for-signature`,
    { cookie, json: {} },
  );
  expect(send.status).toBe(201);
  const envelopeId = send.body.envelope.providerEnvelopeId;
  const id = uniq();
  for (let order = 1; order <= signers; order += 1) {
    await api('POST', '/webhooks/signature', {
      json: {
        provider: 'FAKE',
        eventType: 'SIGNER_SIGNED',
        providerEventId: `c-sig-${String(order)}-${id}`,
        providerEnvelopeId: envelopeId,
        signerOrder: order,
      },
    });
  }
  await api('POST', '/webhooks/signature', {
    json: {
      provider: 'FAKE',
      eventType: 'COMPLETED',
      providerEventId: `c-complete-${id}`,
      providerEnvelopeId: envelopeId,
    },
  });
  await poll(
    () => api<{ contract: { status: string } }>('GET', `/contracts/${contractId}`, { cookie }),
    (res) => res.body.contract.status === 'SIGNED',
    'a assinatura FAKE de todos os signatários deve levar o contrato a SIGNED',
  );
  return contractId;
}

export interface CoOwnedLeaseSeed {
  cookie: string;
  leaseId: string;
  propertyId: string;
  majorityName: string;
  minorityName: string;
}

/** Locação ativa de um imóvel com dois proprietários (60% e 40%). */
export async function seedCoOwnedLease(label: string): Promise<CoOwnedLeaseSeed> {
  const { cookie } = await registerViaApi(label);
  const id = uniq();
  const propertyId = await seedReadyProperty(cookie, `Imóvel C ${label} ${id}`);
  const majorityName = `Proprietária Maior ${label} ${id}`;
  const minorityName = `Proprietário Menor ${label} ${id}`;
  for (const [name, cpf, pct] of [
    [majorityName, VALID_CPFS[1], 60],
    [minorityName, VALID_CPFS[2], 40],
  ] as const) {
    const partyId = await seedParty(cookie, name, cpf);
    const owner = await api('POST', `/properties/${propertyId}/owners`, {
      cookie,
      json: { partyId, ownershipSharePct: pct },
    });
    expect(owner.status, `proprietário ${name}`).toBe(201);
  }
  const tenantId = await seedParty(cookie, `Inquilina C ${label} ${id}`, VALID_CPFS[0]);
  const applicationId = await seedApprovedApplication(cookie, propertyId, tenantId);
  const templateId = await seedApprovedTemplate(cookie, `Template C ${label} ${id}`);
  // Dois proprietários e o inquilino assinam.
  const contractId = await seedContractSignedBy(cookie, applicationId, templateId, 3);
  const lease = await api<{ lease: IdBody }>('POST', '/leases', { cookie, json: { contractId } });
  expect(lease.status).toBe(201);
  return { cookie, leaseId: lease.body.lease.id, propertyId, majorityName, minorityName };
}
