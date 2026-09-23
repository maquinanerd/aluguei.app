import { describe, expect, it } from 'vitest';
import { toPropertyDto } from './properties.js';

/**
 * Regression test — bug audit 2026-08-17:
 * POST /properties/:id/owners retornava 400 "createdAt: Invalid input: expected
 * string, received Date" quando o imóvel possuía mídia.
 *
 * Causa raiz: Drizzle/node-postgres entrega `Date` para colunas timestamp, mas os
 * schemas Zod de contrato definem o formato de fio como string ISO 8601. O DTO
 * copiava o valor bruto do DB (vazamento de tipo na fronteira).
 *
 * PGlite serializa timestamps como string e mascara o problema; PostgreSQL real
 * entrega `Date`. Este teste constrói o boundary com `Date` REAL, de forma
 * determinística, para que o vazamento falhe em qualquer driver.
 */
const ISO = '2026-01-02T00:00:00.000Z';
const PID = '11111111-1111-4111-8111-111111111111';
const OID = '22222222-2222-4222-8222-222222222222';
const MID = '33333333-3333-4333-8333-333333333333';
const AID = '44444444-4444-4444-8444-444444444444';

function buildLoadedProperty(): Parameters<typeof toPropertyDto>[0] {
  return {
    id: PID,
    orgId: OID,
    title: 'Apartamento Teste',
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
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    addresses: [],
    financialTerms: null,
    owners: [],
    features: [],
    media: [
      {
        id: MID,
        orgId: OID,
        propertyId: PID,
        kind: 'PHOTO',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        storageKey: 'org/key',
        isPublic: true,
        caption: null,
        sortOrder: 0,
        isCover: true,
        isEvidence: false,
        durationMs: null,
        capturedAt: null,
        createdAt: new Date(ISO),
        updatedAt: new Date(ISO),
      },
    ],
  };
}

describe('property DTO — boundary DB → API (Date serialization)', () => {
  it('normaliza Date do imóvel para ISO 8601', () => {
    const dto = toPropertyDto(buildLoadedProperty()) as { createdAt: string };
    expect(dto.createdAt).toBe(ISO);
  });

  it('normaliza Date da mídia para ISO 8601 (bug owners+mídia)', () => {
    const dto = toPropertyDto(buildLoadedProperty()) as {
      media: Array<{ createdAt: string }>;
    };
    expect(dto.media).toHaveLength(1);
    expect(dto.media[0]?.createdAt).toBe(ISO);
  });

  it('não vaza colunas internas nem Dates do endereço', () => {
    const loaded = buildLoadedProperty();
    loaded.addresses = [
      {
        id: AID,
        label: null,
        street: 'Rua X',
        number: '10',
        complement: null,
        neighborhood: null,
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100',
        country: 'BR',
        isPublic: true,
        lat: null,
        lng: null,
        createdAt: new Date(ISO),
        updatedAt: new Date(ISO),
      },
    ];
    const dto = toPropertyDto(loaded) as {
      addresses: Array<{ street: string; city: string; createdAt?: string; lat?: unknown }>;
    };
    expect(dto.addresses[0]?.street).toBe('Rua X');
    expect(dto.addresses[0]?.city).toBe('São Paulo');
    expect(dto.addresses[0]).not.toHaveProperty('createdAt');
    expect(dto.addresses[0]).not.toHaveProperty('lat');
    expect(dto.addresses[0]).not.toHaveProperty('lng');
  });

  it('aceita endereço sem mídia (caminho feliz) sem lançar', () => {
    expect(() => toPropertyDto(buildLoadedProperty())).not.toThrow();
  });
});
