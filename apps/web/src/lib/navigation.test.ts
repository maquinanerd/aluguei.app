import { describe, expect, it } from 'vitest';
import { breadcrumbFor, findNavItem } from './navigation';

describe('navegação: subpáginas acendem o item do menu', () => {
  it('Canais → Grupo OLX fica sob Canais, no grupo Imóveis', () => {
    expect(findNavItem('/app/channels/grupo-olx')?.href).toBe('/app/channels');
    expect(breadcrumbFor('/app/channels/grupo-olx')).toEqual([
      { label: 'Painel', href: '/app' },
      { label: 'Imóveis' },
      { label: 'Canais' },
    ]);
  });

  it('rota que só começa com o mesmo texto não acende Canais', () => {
    expect(findNavItem('/app/channelsx')).toBeNull();
  });
});
