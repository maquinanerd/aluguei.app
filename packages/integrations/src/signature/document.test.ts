import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderContractPdf } from './document.js';

const base = {
  contractId: '11111111-2222-4333-8444-555555555555',
  version: 2,
  content: 'CONTRATO DE LOCAÇÃO\nLOCATÁRIA: Ana Conceição\nALUGUEL: R$ 2.500,00',
  contentHash: 'f'.repeat(64),
};

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('renderContractPdf (P1-11: o documento enviado ao provider é o PDF do contrato)', () => {
  it('gera PDF válido, com título da versão e o hash do texto nos metadados', async () => {
    const bytes = await renderContractPdf(base);
    expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe(`Contrato ${base.contractId} — versão 2`);
    expect(document.getSubject()).toContain(base.contentHash);
  });

  it('é determinístico: mesmo texto gera os mesmos bytes; texto diferente muda o hash', async () => {
    const first = await renderContractPdf(base);
    const second = await renderContractPdf(base);
    expect(sha256(second)).toBe(sha256(first));
    const changed = await renderContractPdf({ ...base, content: `${base.content}\nMULTA: 10%` });
    expect(sha256(changed)).not.toBe(sha256(first));
  });

  it('quebra texto longo em várias páginas', async () => {
    const content = Array.from(
      { length: 160 },
      (_, index) =>
        `Cláusula ${String(index + 1)}: o locatário se obriga a conservar o imóvel e a devolvê-lo no estado em que o recebeu.`,
    ).join('\n');
    const document = await PDFDocument.load(await renderContractPdf({ ...base, content }));
    expect(document.getPageCount()).toBeGreaterThan(1);
  });

  it('caractere fora da fonte padrão não derruba a geração', async () => {
    const bytes = await renderContractPdf({ ...base, content: 'Seta → emoji 🏠\ttab' });
    expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
