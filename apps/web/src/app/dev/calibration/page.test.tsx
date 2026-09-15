import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('./calibration-client', () => ({
  Calibration: () => null,
}));

import CalibrationPage from './page';

/**
 * P3 (auditoria 2026-09-10): `/dev/calibration` respondia sem login em
 * produção, com dados fictícios ("128 leads", "R$ 18,4 mi"). Mesmo precedente
 * da API, que só registra rotas `/dev` fora de produção (apps/api/src/app.ts).
 */
describe('/dev/calibration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('em produção responde notFound', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => renderToStaticMarkup(<CalibrationPage />)).toThrow('NEXT_NOT_FOUND');
  });

  it('fora de produção continua disponível para calibração visual', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const html = renderToStaticMarkup(<CalibrationPage />);
    expect(html).toContain('Calibração');
  });
});
