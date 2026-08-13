import { describe, expect, it } from 'vitest';
import { normalizeDocument, normalizeEmail, normalizePhone, slugify } from './identifiers.js';

describe('identifiers', () => {
  it('normaliza email para lowercase trim', () => {
    expect(normalizeEmail('  Joao.Silva@Example.COM ')).toBe('joao.silva@example.com');
  });

  it('normaliza telefone para dígitos', () => {
    expect(normalizePhone('(11) 99999-0000')).toBe('11999990000');
  });

  it('normaliza documento para dígitos', () => {
    expect(normalizeDocument('123.456.789-01')).toBe('12345678901');
  });

  it('gera slug', () => {
    expect(slugify('Imobiliária Souza & Cia')).toBe('imobiliaria-souza-cia');
    expect(slugify('  Casa   e  Cia  ')).toBe('casa-e-cia');
  });
});
