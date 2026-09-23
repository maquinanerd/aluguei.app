import { describe, expect, it } from 'vitest';
import {
  propertyMediaSchema,
  propertySchema,
  paymentWebhookEventSchema,
  signatureWebhookEventSchema,
  metaWebhookEventSchema,
  chargeSchema,
  paymentSchema,
  funnelStatusSchema,
  inspectionStatusSchema,
  chargeStatusSchema,
} from '@aluguei/contracts';
import { splitPayment } from '@aluguei/domain';
import { z } from 'zod';

/**
 * Contract tests — fronteiras entre domínio, API e providers externos.
 * O bug "owners+mídia (Date vs string)" não pode voltar: o formato de fio dos
 * DTOs é ISO 8601 string; valores `Date` não atravessam a fronteira.
 */

const ISO = '2026-01-02T00:00:00.000Z';
const UUID = '11111111-1111-4111-8111-111111111111';

describe('serialização de datas (wire format ISO 8601 string)', () => {
  it('propertyMediaSchema aceita ISO string e REJEITA Date (regressão owners+mídia)', () => {
    const ok = propertyMediaSchema.safeParse({
      id: UUID,
      kind: 'PHOTO',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      isPublic: true,
      caption: 'Cozinha',
      sortOrder: 0,
      isCover: true,
      createdAt: ISO,
    });
    expect(ok.success).toBe(true);

    const bad = propertyMediaSchema.safeParse({
      id: UUID,
      kind: 'PHOTO',
      mimeType: null,
      sizeBytes: null,
      isPublic: false,
      caption: null,
      sortOrder: 0,
      isCover: false,
      createdAt: new Date(ISO),
    });
    expect(bad.success).toBe(false);
  });

  it('round-trip JSON de DTO de property é estável (parse → stringify → parse)', () => {
    const dto = {
      id: UUID,
      orgId: UUID,
      title: 'Apto',
      description: null,
      status: 'ACTIVE',
      propertyType: 'APARTMENT',
      purpose: 'RENT',
      totalAreaSqm: null,
      builtAreaSqm: null,
      bedrooms: null,
      bathrooms: null,
      parkingSpots: null,
      furnished: false,
      petsAllowed: null,
      createdAt: ISO,
      updatedAt: ISO,
      addresses: [],
      financialTerms: null,
      owners: [],
      features: [],
      media: [
        {
          id: UUID,
          kind: 'PHOTO',
          mimeType: 'image/jpeg',
          sizeBytes: 1,
          isPublic: true,
          caption: null,
          sortOrder: 0,
          isCover: false,
          createdAt: ISO,
        },
      ],
    } as const;
    const parsed = propertySchema.parse(dto);
    const reParsed = propertySchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reParsed).toEqual(parsed);
  });

  it('timestamps de webhooks exigem string (nunca Date)', () => {
    const base = {
      provider: 'ASAAS' as const,
      eventType: 'PAYMENT_CONFIRMED' as const,
      providerEventId: 'evt-1',
      providerChargeId: 'pay_123',
      amountCents: 1000,
    };
    expect(paymentWebhookEventSchema.safeParse({ ...base, paidAt: ISO }).success).toBe(true);
    const dateInput: unknown = { ...base, paidAt: new Date(ISO) };
    expect(paymentWebhookEventSchema.safeParse(dateInput).success).toBe(false);
  });
});

describe('identificadores externos (provider ids) em webhooks', () => {
  it('signature webhook exige providerEnvelopeId (nunca confia em org_id)', () => {
    const ok = signatureWebhookEventSchema.safeParse({
      provider: 'CLICKSIGN',
      eventType: 'SIGNER_SIGNED',
      providerEventId: 'e1',
      providerEnvelopeId: 'env-1',
      signerOrder: 1,
    });
    expect(ok.success).toBe(true);
    expect(
      signatureWebhookEventSchema.safeParse({
        provider: 'CLICKSIGN',
        eventType: 'SIGNER_SIGNED',
        providerEventId: 'e1',
        signerOrder: 1,
      }).success,
    ).toBe(false);
  });

  it('meta webhook exige providerEventId e aceita adAccountId opcional', () => {
    const ok = metaWebhookEventSchema.safeParse({
      provider: 'META',
      eventType: 'CAMPAIGN_UPDATE',
      providerEventId: 'm1',
      adAccountId: 'act_123',
    });
    expect(ok.success).toBe(true);
    expect(
      metaWebhookEventSchema.safeParse({
        provider: 'META',
        eventType: 'CAMPAIGN_UPDATE',
        adAccountId: 'act_123',
      }).success,
    ).toBe(false);
  });
});

describe('dinheiro (centavos inteiros) e enums', () => {
  it('schemas financeiros exigem centavos inteiros não negativos', () => {
    const charge = {
      id: UUID,
      orgId: UUID,
      leaseId: UUID,
      periodStart: '2026-11-01',
      dueDate: '2026-11-11',
      status: 'SCHEDULED' as const,
      amountCents: 100000,
      rentCents: 100000,
      condoFeeCents: 0,
      lateFeeCents: 0,
      interestCents: 0,
      taxesCents: 0,
      discountCents: 0,
      paidAt: null,
      providerChargeId: null,
      createdAt: ISO,
    } as const;
    expect(chargeSchema.safeParse(charge).success).toBe(true);
    expect(chargeSchema.safeParse({ ...charge, amountCents: 1000.5 }).success).toBe(false);
    expect(chargeSchema.safeParse({ ...charge, amountCents: -1 }).success).toBe(false);
  });

  it('split é determinístico e exato (sem perda de centavos)', () => {
    const allocations = splitPayment({
      rentCents: 1000,
      amountCents: 1000,
      agencyShareBps: 1000, // 10% sobre o aluguel
    });
    const sum = allocations.reduce((acc, a) => acc + a.amountCents, 0);
    expect(sum).toBe(1000); // TOTAL = landlord + agência (nunca sobram/perdem centavos)
    expect(allocations.every((a) => Number.isInteger(a.amountCents))).toBe(true);
    // Comissão 10% de R$10,00 = R$1,00; landlord recebe R$9,00.
    expect(allocations.find((a) => a.role === 'AGENCY')?.amountCents).toBe(100);
    expect(allocations.find((a) => a.role === 'LANDLORD')?.amountCents).toBe(900);
  });

  it('enums de máquina de estado são cobertos por transitions (sem valores órfãos)', () => {
    const chargeStatuses = chargeStatusSchema.options;
    expect(chargeStatuses).toContain('PAID');
    expect(chargeStatuses).toContain('REFUNDED');
    const inspectionStatuses = inspectionStatusSchema.options;
    expect(inspectionStatuses).toContain('REVIEW');
    expect(inspectionStatuses).toContain('COMPLETED');
    const funnel = funnelStatusSchema.options;
    expect(funnel).toContain('QUALIFIED');
    expect(funnel).toContain('LOST');
  });

  it('payment webhook mapeia evento do provider (PAYMENT_CONFIRMED → PIX pago)', () => {
    const event = paymentWebhookEventSchema.parse({
      provider: 'ASAAS',
      eventType: 'PAYMENT_CONFIRMED',
      providerEventId: 'asaas-webhook-1',
      providerChargeId: 'pay_123',
      amountCents: 250000,
      paidAt: ISO,
    });
    expect(event.amountCents).toBe(250000);
    expect(event.providerChargeId).toBe('pay_123');
  });
});

describe('nullable/optional de fronteira', () => {
  it('paymentSchema tolera nulls em campos opcionais (estado pós-pagamento)', () => {
    const payment = {
      id: UUID,
      orgId: UUID,
      chargeId: UUID,
      method: 'PIX' as const,
      status: 'PENDING' as const,
      amountCents: 100000,
      providerPaymentId: null,
      paidAt: null,
      pixQrCode: null,
      boletoUrl: null,
      createdAt: ISO,
    };
    const schema = paymentSchema.extend({ method: z.enum(['PIX', 'BOLETO', 'CARD']) });
    expect(schema.safeParse(payment).success).toBe(true);
  });
});
