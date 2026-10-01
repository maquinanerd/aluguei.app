import { describe, expect, it } from 'vitest';
import * as contracts from '@aluguei/contracts';
import {
  PORTAL_PROPERTY_TYPE_LABELS,
  PUBLICATION_TIER_LABELS,
  DESTINATION_LABELS,
  acaoDaPublicacao,
  motivoPrincipal,
  quando,
} from './grupo-olx';

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('Grupo OLX na tela (ADR-107)', () => {
  it('todo tipo, destaque e destino do contrato tem nome em português', () => {
    expect(sorted(Object.keys(PORTAL_PROPERTY_TYPE_LABELS))).toEqual(
      sorted(contracts.grupoOlxPropertyTypeSchema.options),
    );
    expect(sorted(Object.keys(PUBLICATION_TIER_LABELS))).toEqual(
      sorted(contracts.grupoOlxPublicationTierSchema.options),
    );
    expect(sorted(Object.keys(DESTINATION_LABELS))).toEqual(
      sorted(contracts.grupoOlxDestinationSchema.options),
    );
  });

  it('ação da linha: no feed, publicar reabre e remover tira do arquivo', () => {
    expect(acaoDaPublicacao('grupoolx', 'BLOCKED')).toBe('publicar');
    expect(acaoDaPublicacao('grupoolx', 'REMOVED')).toBe('publicar');
    expect(acaoDaPublicacao('grupoolx', 'AWAITING_IMPORT')).toBe('remover');
    expect(acaoDaPublicacao('grupoolx', 'IMPORT_ERROR')).toBe('remover');
    expect(acaoDaPublicacao('grupoolx', 'REMOVING')).toBeNull();
    expect(acaoDaPublicacao('fake', 'PUBLISHED')).toBe('remover');
    expect(acaoDaPublicacao('fake', 'FAILED')).toBe('publicar');
  });

  it('motivo principal: o primeiro bloqueio, senão o primeiro aviso', () => {
    const aviso = { code: 'FEATURES_UNMAPPED', message: 'aviso', blocking: false };
    const bloqueio = { code: 'POSTAL_CODE', message: 'CEP', blocking: true };
    expect(motivoPrincipal([aviso, bloqueio])).toBe(bloqueio);
    expect(motivoPrincipal([aviso])).toBe(aviso);
    expect(motivoPrincipal([])).toBeNull();
  });

  it('quando: nunca, minutos, horas e dias', () => {
    const agora = new Date('2026-10-01T12:00:00Z');
    expect(quando(null, agora)).toBe('nunca');
    expect(quando('2026-10-01T11:30:00Z', agora)).toBe('há 30 min');
    expect(quando('2026-10-01T09:00:00Z', agora)).toBe('há 3 h');
    expect(quando('2026-09-30T12:00:00Z', agora)).toBe('há 1 dia');
  });
});
