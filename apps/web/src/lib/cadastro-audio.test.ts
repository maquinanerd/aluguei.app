import { describe, expect, it } from 'vitest';
import {
  GRUPOS,
  ROTULO_DO_CAMPO,
  duracaoLegivel,
  faltaParaConfirmar,
  progressoDaRevisao,
  valorLegivel,
  valorParaApi,
  valorParaEdicao,
} from './cadastro-audio';
import type { CampoDoRascunho, ChaveDoCampo } from './cadastro-audio';

const campo = (
  key: ChaveDoCampo,
  value: string | null,
  state: CampoDoRascunho['state'] = 'FROM_AUDIO',
): CampoDoRascunho => ({ key, value, state, evidence: null });

describe('cadastro por áudio — leitura dos valores', () => {
  it('dinheiro aparece em reais, guardado em centavos', () => {
    expect(valorLegivel(campo('MONTHLY_RENT_CENTS', '230000'))).toContain('2.300,00');
  });

  it('campo vazio vira travessão, nunca R$ 0,00', () => {
    // R$ 0,00 num aluguel é afirmação falsa sobre preço; o travessão diz "não sei".
    expect(valorLegivel(campo('MONTHLY_RENT_CENTS', null))).toBe('—');
    expect(valorLegivel(campo('MONTHLY_RENT_CENTS', '  '))).toBe('—');
    expect(valorLegivel(campo('BEDROOMS', null))).toBe('—');
  });

  it('traduz o que o banco guarda em código', () => {
    expect(valorLegivel(campo('PROPERTY_TYPE', 'APARTMENT'))).toBe('Apartamento');
    expect(valorLegivel(campo('PURPOSE', 'RENT'))).toBe('Aluguel');
    expect(valorLegivel(campo('PETS_ALLOWED', 'true'))).toBe('Sim');
    expect(valorLegivel(campo('FURNISHED', 'false'))).toBe('Não');
    expect(valorLegivel(campo('TOTAL_AREA_SQM', '72'))).toBe('72 m²');
  });

  it('valor desconhecido aparece como veio, em vez de sumir', () => {
    expect(valorLegivel(campo('PROPERTY_TYPE', 'CHACARA'))).toBe('CHACARA');
  });
});

describe('cadastro por áudio — edição', () => {
  it('dinheiro é editado em reais e volta em centavos', () => {
    expect(valorParaEdicao(campo('CONDO_FEE_CENTS', '48000'))).toBe('480');
    expect(valorParaApi('CONDO_FEE_CENTS', '480')).toBe('48000');
    expect(valorParaApi('CONDO_FEE_CENTS', '1.250,50')).toBe('125050');
  });

  it('campo apagado vira nulo, não zero', () => {
    expect(valorParaApi('CONDO_FEE_CENTS', '   ')).toBeNull();
    expect(valorParaApi('BEDROOMS', '')).toBeNull();
  });

  it('valor impossível não vira número inventado', () => {
    expect(valorParaApi('MONTHLY_RENT_CENTS', 'abc')).toBeNull();
    expect(valorParaApi('MONTHLY_RENT_CENTS', '-5')).toBeNull();
  });
});

describe('cadastro por áudio — progresso da revisão', () => {
  it('o que espera confirmação não conta como confirmado', () => {
    // Se contasse, a barra diria "pronto" com valores que ninguém conferiu.
    const progresso = progressoDaRevisao([
      campo('BEDROOMS', '2', 'FROM_AUDIO'),
      campo('CONDO_FEE_CENTS', '48000', 'NEEDS_CONFIRMATION'),
      campo('TITLE', null, 'MISSING'),
      campo('IPTU_CENTS', '13000', 'EDITED'),
    ]);
    expect(progresso).toEqual({ confirmados: 2, total: 4, faltando: 1, aConfirmar: 1 });
  });
});

describe('cadastro por áudio — o que falta para criar o imóvel', () => {
  it('cobra título e tipo, que são o mínimo do cadastro', () => {
    expect(faltaParaConfirmar([campo('TITLE', null, 'MISSING')])).toEqual([
      'TITLE',
      'PROPERTY_TYPE',
    ]);
    expect(
      faltaParaConfirmar([campo('TITLE', 'Apto Bueno'), campo('PROPERTY_TYPE', 'APARTMENT')]),
    ).toEqual([]);
  });

  it('título só com espaço não conta como preenchido', () => {
    expect(
      faltaParaConfirmar([campo('TITLE', '   '), campo('PROPERTY_TYPE', 'APARTMENT')]),
    ).toEqual(['TITLE']);
  });
});

describe('cadastro por áudio — apresentação', () => {
  it('todo campo agrupado tem rótulo, e todo rótulo tem grupo', () => {
    const agrupados = GRUPOS.flatMap((grupo) => grupo.campos);
    expect(new Set(agrupados).size, 'campo repetido em dois grupos').toBe(agrupados.length);
    expect(agrupados.sort()).toEqual(Object.keys(ROTULO_DO_CAMPO).sort());
  });

  it('mostra a duração do que foi gravado', () => {
    expect(duracaoLegivel(188)).toBe('3min 08s');
    expect(duracaoLegivel(0)).toBe('0min 00s');
    expect(duracaoLegivel(null)).toBeNull();
  });
});
