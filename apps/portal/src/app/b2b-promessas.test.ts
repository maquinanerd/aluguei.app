import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RECURSOS } from '@/lib/planos';
import { CANAIS, FAQ_PLANOS, FLUXO } from './b2b-conteudo';

/**
 * Defeito 3 da Onda 0 (rodada de fidelidade): as páginas B2B diziam "Integrado" para Canal Pro,
 * OLX e Imovelweb e prometiam publicação, sincronia e leads desses portais — que não têm adapter
 * (`packages/integrations/src/channels/registry.ts`). O ADR-097 e o ADR-105 mandam mostrar o
 * estado real; o `AGENTS.md` proíbe declarar integração sem evidência. WhatsApp e Meta Ads estão
 * implementados e não verificados ao vivo (`docs/BLOCKERS.md`), então também não aparecem como
 * prontos. Estes testes olham o que a página afirma, não o estilo.
 */

const PAGINAS = [
  'para-imobiliarias/page.tsx',
  'anunciar/page.tsx',
  'gestao/page.tsx',
  'planos/page.tsx',
];

function fonte(relativo: string): string {
  return readFileSync(fileURLToPath(new URL(relativo, import.meta.url)), 'utf8');
}

const PROMESSAS_SEM_LASTRO = [
  /\bIntegrad[oa]s?\b/,
  /sincroniza/i,
  /num só envio/i,
  /de todos os portais/i,
  /de todos os canais/i,
  /quatro (vitrines|portais)/i,
  /publicam no AchouImóvel, no Canal Pro/i,
];

describe('páginas B2B não prometem integração que não existe', () => {
  it('portal parceiro aparece como "Em preparação", nunca como integrado', () => {
    const parceiros = CANAIS.filter((canal) => canal.nome !== 'AchouImóvel');
    expect(parceiros.map((canal) => canal.nome)).toEqual(['Canal Pro', 'OLX', 'Imovelweb']);
    for (const canal of parceiros) {
      expect(canal.status).toBe('Em preparação');
    }
  });

  it('nenhum texto das páginas B2B afirma publicação ou sincronia nos parceiros', () => {
    const textos = [
      fonte('./b2b-conteudo.ts'),
      ...PAGINAS.map((pagina) => fonte(`./${pagina}`)),
    ].join('\n');
    const achados = PROMESSAS_SEM_LASTRO.filter((regex) => regex.test(textos)).map(String);
    expect(achados).toEqual([]);
  });

  it('na tabela de planos, parceiros e WhatsApp levam o selo "em breve"', () => {
    const porNome = new Map(RECURSOS.map((recurso) => [recurso.nome, recurso]));
    expect(porNome.get('Portais parceiros')?.emBreve).toBe(true);
    expect(porNome.get('Atendimento no WhatsApp')?.emBreve).toBe(true);
  });

  it('no fluxo, o passo do WhatsApp avisa que não está no ar', () => {
    const whatsapp = FLUXO.find((passo) => /WhatsApp/.test(passo.titulo));
    expect(whatsapp?.emBreve).toBeTruthy();
  });

  it('o FAQ não promete painel liberado enquanto a conta está em análise', () => {
    const respostas = FAQ_PLANOS.map((item) => item.resposta).join('\n');
    // Conta em análise não entra no painel (`apps/web/src/app/app/layout.tsx`).
    expect(respostas).not.toMatch(/já pode cadastrar imóveis/i);
  });
});
