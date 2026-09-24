import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBaseUrl, urlCadastro, urlEntrar } from './plataforma';

/**
 * Link do portal para o painel (Onda 3). São hosts diferentes (ADR-100), então
 * um endereço vazio aqui não pode derrubar a página — foi o que aconteceu com
 * `PORTAL_BASE_URL` na primeira implantação.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('endereço do painel', () => {
  it('usa o que veio do ambiente, sem barra no fim', () => {
    vi.stubEnv('APP_BASE_URL', 'https://app.achouimovel.online/');
    expect(appBaseUrl()).toBe('https://app.achouimovel.online');
  });

  it('valor vazio ou inválido cai no padrão em vez de lançar', () => {
    vi.stubEnv('APP_BASE_URL', '');
    expect(appBaseUrl()).toBe('http://localhost:3000');
    vi.stubEnv('APP_BASE_URL', 'nao-e-url');
    expect(appBaseUrl()).toBe('http://localhost:3000');
  });
});

describe('cadastro com plano', () => {
  it('leva o código do plano no ?plano=, que é o que o cadastro lê', () => {
    vi.stubEnv('APP_BASE_URL', 'https://app.achouimovel.online');
    expect(urlCadastro('GESTAO_LOCACAO')).toBe(
      'https://app.achouimovel.online/register?plano=GESTAO_LOCACAO',
    );
  });

  it('sem plano, vai para o cadastro limpo (nunca com plano vazio na URL)', () => {
    vi.stubEnv('APP_BASE_URL', 'https://app.achouimovel.online');
    expect(urlCadastro()).toBe('https://app.achouimovel.online/register');
    expect(urlCadastro(null)).toBe('https://app.achouimovel.online/register');
    expect(urlCadastro('')).toBe('https://app.achouimovel.online/register');
  });

  it('entrar aponta para o login do painel', () => {
    vi.stubEnv('APP_BASE_URL', 'https://app.achouimovel.online');
    expect(urlEntrar()).toBe('https://app.achouimovel.online/login');
  });
});
