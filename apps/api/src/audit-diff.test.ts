import { describe, expect, it } from 'vitest';
import { auditDiff } from './plugins/audit.js';

/**
 * P2-11 (auditoria 2026-09-10): `audit_events.payload` chegava vazio — a trilha dizia que algo
 * mudou, mas não o quê. O diff traz só os campos alterados (antes e depois), sem dado pessoal:
 * campos conhecidos como pessoais aparecem mascarados e texto livre passa pela redação.
 */
describe('auditDiff', () => {
  it('só os campos alterados, com antes e depois', () => {
    const diff = auditDiff(
      { title: 'Casa velha', bedrooms: 2, status: 'AVAILABLE' },
      { title: 'Casa nova', bedrooms: 2 },
    );
    expect(diff).toEqual({
      fields: ['title'],
      changes: { title: { from: 'Casa velha', to: 'Casa nova' } },
    });
  });

  it('ignora carimbos e identificadores', () => {
    const diff = auditDiff(
      { title: 'Casa', updatedAt: new Date('2026-01-01'), id: 'a', orgId: 'o' },
      { title: 'Casa', updatedAt: new Date('2026-09-17'), id: 'a', orgId: 'o' },
    );
    expect(diff).toEqual({ fields: [], changes: {} });
  });

  it('campo novo (antes ausente) e campo apagado aparecem como mudança', () => {
    const diff = auditDiff({ description: null }, { description: 'Reformada', bedrooms: 3 });
    expect(diff.fields).toEqual(['bedrooms', 'description']);
    expect(diff.changes.description).toEqual({ from: null, to: 'Reformada' });
    expect(diff.changes.bedrooms).toEqual({ from: null, to: 3 });
  });

  it('campo pessoal vira marca, nunca valor', () => {
    const diff = auditDiff(
      { name: 'Maria Souza', email: 'maria@exemplo.com', phone: '11912345678' },
      { name: 'Maria de Souza', email: 'maria.souza@exemplo.com', phone: '11987654321' },
    );
    expect(diff.fields).toEqual(['email', 'name', 'phone']);
    for (const field of diff.fields) {
      expect(diff.changes[field]).toEqual({ from: '[REDACTED]', to: '[REDACTED]' });
    }
    expect(JSON.stringify(diff)).not.toContain('Maria');
    expect(JSON.stringify(diff)).not.toContain('exemplo.com');
  });

  it('texto livre com CPF, e-mail ou telefone é redigido', () => {
    const diff = auditDiff(
      { description: 'Sem contato' },
      { description: 'Falar com 11912345678 ou maria@exemplo.com, CPF 529.982.247-25' },
    );
    expect(diff.changes.description?.to).toBe(
      'Falar com [REDACTED:PHONE] ou [REDACTED:EMAIL], CPF [REDACTED:CPF]',
    );
  });

  it('objetos e listas entram pelo conteúdo, não pela referência', () => {
    const diff = auditDiff(
      { features: ['piscina'], terms: { rentCents: 250000 } },
      { features: ['piscina'], terms: { rentCents: 300000 } },
    );
    expect(diff.fields).toEqual(['terms']);
    expect(diff.changes.terms).toEqual({
      from: { rentCents: 250000 },
      to: { rentCents: 300000 },
    });
  });

  it('texto longo é truncado', () => {
    const diff = auditDiff({ description: 'a' }, { description: 'b'.repeat(500) });
    expect(String(diff.changes.description?.to)).toHaveLength(200);
  });

  it('campos pessoais extras podem ser declarados por quem chama', () => {
    const diff = auditDiff({ apelido: 'Mari' }, { apelido: 'Maria' }, { personal: ['apelido'] });
    expect(diff.changes.apelido).toEqual({ from: '[REDACTED]', to: '[REDACTED]' });
  });
});
