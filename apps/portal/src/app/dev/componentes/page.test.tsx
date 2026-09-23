import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('./catalogo-client', () => ({
  Catalogo: () => null,
}));

import ComponentesPage from './page';

/**
 * Mesmo precedente de `/dev/calibration` no painel e das rotas `/dev` da API:
 * página de desenvolvimento não responde em produção.
 */
describe('/dev/componentes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('em produção responde notFound', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => ComponentesPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('fora de produção renderiza o catálogo', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => ComponentesPage()).not.toThrow();
  });
});
