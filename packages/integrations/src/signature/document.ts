import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

/** Versão imutável do texto do contrato (`contract_versions`) que vira documento. */
export interface ContractPdfInput {
  contractId: string;
  version: number;
  content: string;
  /** SHA-256 hex do texto (`contracts.content_hash`). */
  contentHash: string;
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const HEADER_SIZE = 12;
const BODY_SIZE = 11;
const BODY_LEADING = 15;
const FOOTER_SIZE = 8;
const BODY_TOP = PAGE_HEIGHT - MARGIN - 28;
const BODY_BOTTOM = MARGIN + 10;
const LINES_PER_PAGE = Math.floor((BODY_TOP - BODY_BOTTOM) / BODY_LEADING) + 1;
const TAB = '    ';

/**
 * PDF do contrato enviado ao provider de assinatura (auditoria 2026-09-10,
 * P1-11: o provider recebia o hash do texto no lugar do documento).
 *
 * Determinístico — sem data de criação, produtor automático nem identificador
 * aleatório —: a mesma versão do texto gera sempre os mesmos bytes, e o hash
 * gravado no envelope confere com o documento reproduzido a partir de
 * `contract_versions` (enquanto este renderizador não mudar).
 *
 * Fonte padrão do PDF (Helvetica, WinAnsi): acentos do português são
 * suportados; caractere fora da fonte vira "?" em vez de derrubar a geração.
 */
export async function renderContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const title = `Contrato ${input.contractId} — versão ${String(input.version)}`;
  pdf.setTitle(title);
  pdf.setSubject(`Texto do contrato — SHA-256 ${input.contentHash}`);
  pdf.setCreator('Aluguei.app');
  pdf.setProducer('Aluguei.app');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines = wrapText(
    toFontText(input.content, regular),
    regular,
    BODY_SIZE,
    PAGE_WIDTH - 2 * MARGIN,
  );
  const pages: string[][] = [];
  for (let start = 0; start < lines.length; start += LINES_PER_PAGE) {
    pages.push(lines.slice(start, start + LINES_PER_PAGE));
  }

  const header = toFontText(title, bold);
  const hash = toFontText(input.contentHash, regular);
  pages.forEach((pageLines, index) => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText(header, { x: MARGIN, y: PAGE_HEIGHT - MARGIN, size: HEADER_SIZE, font: bold });
    let y = BODY_TOP;
    for (const line of pageLines) {
      if (line !== '') {
        page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font: regular });
      }
      y -= BODY_LEADING;
    }
    page.drawText(
      `SHA-256 do texto: ${hash} · página ${String(index + 1)} de ${String(pages.length)}`,
      { x: MARGIN, y: MARGIN - 20, size: FOOTER_SIZE, font: regular, color: rgb(0.35, 0.35, 0.35) },
    );
  });
  return pdf.save({ useObjectStreams: false });
}

/** Normaliza quebras e tabulação e troca por "?" o caractere que a fonte não codifica. */
function toFontText(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  let result = '';
  for (const char of text.replace(/\r\n?/g, '\n').replace(/\t/g, TAB)) {
    const codePoint = char.codePointAt(0) ?? 0;
    result += char === '\n' || supported.has(codePoint) ? char : '?';
  }
  return result;
}

/** Quebra cada parágrafo em linhas que cabem na largura (palavra longa quebra por caractere). */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const fits = (candidate: string): boolean => font.widthOfTextAtSize(candidate, size) <= maxWidth;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (current !== '') {
        lines.push(current);
      }
      current = '';
      for (const char of word) {
        if (current !== '' && !fits(current + char)) {
          lines.push(current);
          current = '';
        }
        current += char;
      }
    }
    lines.push(current);
  }
  return lines;
}
