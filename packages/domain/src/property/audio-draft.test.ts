import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  extractPropertyDraftFromTranscript,
  numeroPorExtenso,
  redactPersonalData,
  temHesitacao,
} from './audio-draft.js';
import type { AudioDraftFieldKey } from './audio-draft.js';

/**
 * O que estes testes seguram, em ordem de importância:
 *
 * 1. **A PII sai antes de tudo.** CPF, telefone e e-mail não ficam na
 *    transcrição guardada nem chegam à extração (ADR-104).
 * 2. **Hesitação vira "confirmar", não vira valor certo.** "acho que dá uns
 *    cento e trinta" é diferente de "o aluguel é dois mil e trezentos", e quem
 *    revisa precisa ver essa diferença.
 * 3. **O que a regra não reconhece fica faltando.** Campo em branco é honesto;
 *    campo chutado parece certo na tela e entra no cadastro.
 */

const CHAVES: AudioDraftFieldKey[] = [
  'PROPERTY_TYPE',
  'PURPOSE',
  'BEDROOMS',
  'BATHROOMS',
  'PARKING_SPOTS',
  'TOTAL_AREA_SQM',
  'MONTHLY_RENT_CENTS',
  'CONDO_FEE_CENTS',
  'IPTU_CENTS',
  'PETS_ALLOWED',
  'FURNISHED',
  'NEIGHBORHOOD',
  'ZIP_CODE',
  'STREET',
];

/** O ditado da tela de referência, sem os dados de pessoa. */
const DITADO =
  'Esse aqui é um apartamento pra alugar no Setor Bueno, tem dois quartos, um é suíte, ' +
  'uma vaga, uns setenta e dois metros quadrados. O aluguel é dois mil e trezentos, ' +
  'condomínio quatrocentos e oitenta mais ou menos, o IPTU acho que dá uns cento e trinta. ' +
  'Aceita pet, não é mobiliado.';

function campo(transcricao: string, chave: AudioDraftFieldKey) {
  const campos = extractPropertyDraftFromTranscript(transcricao, CHAVES);
  const achado = campos.find((c) => c.key === chave);
  if (!achado) {
    throw new Error(`campo ${chave} não veio na extração`);
  }
  return achado;
}

describe('cadastro por áudio — redação de PII', () => {
  it('tira CPF, telefone e e-mail da transcrição', () => {
    const texto = redactPersonalData(
      'O dono é 529.982.247-25, telefone (62) 98812-5678, e-mail marcos@exemplo.com.br.',
    );
    expect(texto).not.toMatch(/529/);
    expect(texto).not.toMatch(/8812/);
    expect(texto).not.toMatch(/@/);
    expect(texto.split(REDACTED).length - 1).toBe(3);
  });

  it('a extração nunca vê o que foi redigido', () => {
    const comPii = `${DITADO} O dono é 529.982.247-25.`;
    const campos = extractPropertyDraftFromTranscript(comPii, CHAVES);
    const tudo = JSON.stringify(campos);
    expect(tudo).not.toMatch(/529\.?982/);
  });

  it('não confunde CEP com telefone', () => {
    // Oito dígitos com hífen no meio existem nos dois formatos; o CEP tem de
    // sobreviver, porque é campo de endereço.
    expect(redactPersonalData('CEP 74150-020')).toContain('74150-020');
  });
});

describe('cadastro por áudio — número por extenso', () => {
  it('lê valores que o corretor fala', () => {
    expect(numeroPorExtenso('dois mil e trezentos')).toBe(2300);
    expect(numeroPorExtenso('quatrocentos e oitenta')).toBe(480);
    expect(numeroPorExtenso('cento e trinta')).toBe(130);
    expect(numeroPorExtenso('setenta e dois')).toBe(72);
    expect(numeroPorExtenso('mil')).toBe(1000);
  });

  it('devolve nulo no que não reconhece, em vez de chutar', () => {
    expect(numeroPorExtenso('um monte')).toBeNull();
    expect(numeroPorExtenso('')).toBeNull();
  });
});

describe('cadastro por áudio — extração da transcrição', () => {
  it('reconhece tipo, finalidade e características ditas com clareza', () => {
    expect(campo(DITADO, 'PROPERTY_TYPE')).toMatchObject({
      value: 'APARTMENT',
      state: 'FROM_AUDIO',
    });
    expect(campo(DITADO, 'PURPOSE')).toMatchObject({ value: 'RENT', state: 'FROM_AUDIO' });
    expect(campo(DITADO, 'BEDROOMS')).toMatchObject({ value: '2', state: 'FROM_AUDIO' });
    expect(campo(DITADO, 'PARKING_SPOTS')).toMatchObject({ value: '1', state: 'FROM_AUDIO' });
    expect(campo(DITADO, 'PETS_ALLOWED')).toMatchObject({ value: 'true', state: 'FROM_AUDIO' });
    expect(campo(DITADO, 'FURNISHED')).toMatchObject({ value: 'false' });
  });

  it('guarda dinheiro em centavos', () => {
    expect(campo(DITADO, 'MONTHLY_RENT_CENTS').value).toBe('230000');
  });

  it('separa o que foi dito com hesitação do que foi dito com certeza', () => {
    // "o aluguel é dois mil e trezentos" — sem hesitação.
    expect(campo(DITADO, 'MONTHLY_RENT_CENTS').state).toBe('FROM_AUDIO');
    // "condomínio quatrocentos e oitenta mais ou menos" e "IPTU acho que dá uns
    // cento e trinta" — a pessoa precisa confirmar antes de virar cadastro.
    expect(campo(DITADO, 'CONDO_FEE_CENTS').state).toBe('NEEDS_CONFIRMATION');
    expect(campo(DITADO, 'IPTU_CENTS').state).toBe('NEEDS_CONFIRMATION');
  });

  it('marca como faltando o que não foi dito', () => {
    expect(campo(DITADO, 'BATHROOMS')).toMatchObject({ value: null, state: 'MISSING' });
    expect(campo(DITADO, 'ZIP_CODE')).toMatchObject({ value: null, state: 'MISSING' });
    expect(campo(DITADO, 'STREET')).toMatchObject({ value: null, state: 'MISSING' });
  });

  it('devolve todas as chaves pedidas, preenchidas ou não', () => {
    const campos = extractPropertyDraftFromTranscript(DITADO, CHAVES);
    expect(campos.map((c) => c.key)).toEqual(CHAVES);
  });

  it('guarda o trecho que originou o valor, com o acento do original', () => {
    expect(campo(DITADO, 'BEDROOMS').evidence).toContain('quartos');
    // A regra procura sem acento; o campo é lido por gente.
    expect(campo('Casa no bairro Jardim Goiás com dois quartos', 'NEIGHBORHOOD').value).toBe(
      'Jardim Goiás',
    );
  });

  it('lê o bairro com o "Setor" que faz parte do nome', () => {
    expect(campo(DITADO, 'NEIGHBORHOOD').value).toBe('Setor Bueno');
    expect(campo('Apartamento no bairro Centro', 'NEIGHBORHOOD').value).toBe('Centro');
  });

  it('transcrição vazia não inventa nada', () => {
    const campos = extractPropertyDraftFromTranscript('', CHAVES);
    expect(campos.every((c) => c.state === 'MISSING')).toBe(true);
  });

  it('reconhece venda quando o corretor fala em vender', () => {
    expect(campo('Casa para vender no setor Marista', 'PURPOSE').value).toBe('SALE');
    expect(campo('Casa para vender no setor Marista', 'PROPERTY_TYPE').value).toBe('HOUSE');
  });
});

describe('cadastro por áudio — hesitação', () => {
  it('reconhece as formas que o corretor usa', () => {
    expect(temHesitacao('acho que dá uns')).toBe(true);
    expect(temHesitacao('mais ou menos')).toBe(true);
    expect(temHesitacao('o aluguel é')).toBe(false);
  });
});
