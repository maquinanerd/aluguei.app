import { describe, expect, it } from 'vitest';
import {
  consumeErrorMessage,
  portalAccessState,
  portalDestination,
  portalEntryLink,
} from './portal-access';
import type { PortalAccessSummary } from './portal-access';

const base: PortalAccessSummary = {
  id: 'a1',
  partyId: 'p1',
  kind: 'TENANT',
  createdAt: '2026-09-16T12:00:00.000Z',
  revokedAt: null,
  linkActive: true,
  linkExpiresAt: '2026-09-23T12:00:00.000Z',
  activeSessions: 0,
};

describe('acesso ao portal pela interface', () => {
  it('monta o link de entrada com o token codificado e sem barra dupla', () => {
    expect(portalEntryLink('https://aluguei.exemplo/', 'abc+/=')).toBe(
      'https://aluguei.exemplo/portal/entrar?token=abc%2B%2F%3D',
    );
  });

  it('leva cada tipo de acesso ao portal certo', () => {
    expect(portalDestination('TENANT')).toBe('/inquilino');
    expect(portalDestination('LANDLORD')).toBe('/proprietario');
  });

  it('situação: link não usado, link usado e acesso revogado', () => {
    expect(portalAccessState(base).label).toBe('Link ainda não usado · vale até 23/09/2026');
    expect(portalAccessState({ ...base, linkActive: false, linkExpiresAt: null })).toEqual({
      label: 'Link já usado',
      tone: 'success',
    });
    expect(
      portalAccessState({ ...base, linkActive: false, revokedAt: '2026-09-17T00:00:00.000Z' })
        .label,
    ).toBe('Acesso revogado');
  });

  it('mensagens do consumo do token por status', () => {
    expect(consumeErrorMessage(401)).toContain('inválido, expirou ou já foi usado');
    expect(consumeErrorMessage(403)).toContain('suspenso');
    expect(consumeErrorMessage(429)).toContain('Aguarde um minuto');
    expect(consumeErrorMessage(500)).toContain('Não foi possível abrir o portal');
  });
});
