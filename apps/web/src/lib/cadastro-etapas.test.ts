import { describe, expect, it } from 'vitest';
import { erroDaEtapa, planoInicialValido } from './cadastro-etapas';
import type { DadosDoCadastro } from './cadastro-etapas';

/**
 * Cadastro em etapas (Onda 3). O que importa aqui é não travar quem está certo e
 * não deixar passar o que a API vai recusar depois de seis telas — o erro tem de
 * aparecer na pergunta onde ele nasceu.
 */

function dados(parcial: Partial<DadosDoCadastro> = {}): DadosDoCadastro {
  return {
    name: 'Rafael Almeida',
    email: 'rafael@imobiliaria.com.br',
    organizationName: 'Imobiliária Exemplo',
    document: '',
    phone: '',
    creci: '',
    requestedPlanCode: '',
    password: 'senha-bem-seguraa',
    ...parcial,
  };
}

describe('validação por etapa', () => {
  it('deixa passar o caminho feliz em todas as etapas', () => {
    for (let etapa = 1; etapa <= 6; etapa += 1) {
      expect(erroDaEtapa(etapa, dados())).toBeNull();
    }
  });

  it('cobra nome, e-mail, imobiliária e senha onde eles são pedidos', () => {
    expect(erroDaEtapa(1, dados({ name: '  ' }))).toBe('Informe seu nome.');
    expect(erroDaEtapa(2, dados({ email: 'sem-arroba' }))).toBe('Informe um e-mail válido.');
    expect(erroDaEtapa(3, dados({ organizationName: '' }))).toBe('Informe o nome da imobiliária.');
    expect(erroDaEtapa(6, dados({ password: 'curta' }))).toBe(
      'A senha precisa de pelo menos 8 caracteres.',
    );
  });

  it('campo opcional em branco não trava; preenchido errado, sim', () => {
    expect(erroDaEtapa(3, dados({ document: '' }))).toBeNull();
    expect(erroDaEtapa(3, dados({ document: '12.345.678/0001-90' }))).toBeNull();
    expect(erroDaEtapa(3, dados({ document: '123' }))).toBe('CPF tem 11 dígitos e CNPJ tem 14.');
    expect(erroDaEtapa(4, dados({ phone: '' }))).toBeNull();
    expect(erroDaEtapa(4, dados({ phone: '(62) 99999-9999' }))).toBeNull();
    expect(erroDaEtapa(4, dados({ phone: '999' }))).toBe('Telefone com DDD.');
  });

  it('a etapa do plano nunca trava: quem não escolhe combina na análise', () => {
    expect(erroDaEtapa(5, dados({ requestedPlanCode: '' }))).toBeNull();
  });
});

describe('plano vindo do portal', () => {
  const disponiveis = ['ANUNCIANTE', 'GESTAO_LOCACAO'];

  it('pré-seleciona o plano quando ele existe', () => {
    expect(planoInicialValido(disponiveis, 'GESTAO_LOCACAO')).toBe('GESTAO_LOCACAO');
  });

  it('ignora plano desconhecido, desligado ou vazio em vez de afirmar', () => {
    expect(planoInicialValido(disponiveis, 'PLANO_QUE_SAIU')).toBeNull();
    expect(planoInicialValido(disponiveis, '')).toBeNull();
    expect(planoInicialValido(disponiveis, null)).toBeNull();
    expect(planoInicialValido([], 'GESTAO_LOCACAO')).toBeNull();
  });
});
