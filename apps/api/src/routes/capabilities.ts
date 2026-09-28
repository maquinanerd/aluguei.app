import type { FastifyPluginAsync } from 'fastify';
import { resolveMetaMode, resolveScreeningProvider } from '@aluguei/config';
import { capabilitiesResponseSchema } from '@aluguei/contracts';
import type {
  ScreeningProviderMode,
  SignatureProviderMode,
  PaymentProviderMode,
} from '@aluguei/contracts';
import { requireSession } from '../plugins/authz.js';

/**
 * O que esta instalação consegue fazer de verdade (Onda 4).
 *
 * O painel usa isto para mostrar a faixa "modo de teste" **pela configuração
 * real**, em vez de texto fixo na tela: quando o provider de verdade entrar, o
 * aviso some sozinho, e enquanto não entrar ele não some por esquecimento.
 *
 * Exige sessão — não é informação de vitrine — e não devolve credencial,
 * endpoint nem nome de conta: só qual adapter está no ar.
 */
export const capabilitiesRoutes: FastifyPluginAsync = (app) => {
  // Handler síncrono: tudo aqui sai de configuração já carregada, sem I/O.
  app.get('/capabilities', (request) => {
    requireSession(request);

    // O screening roda no worker; o que vale aqui é a mesma regra de resolução
    // que ele usa, para o painel não afirmar algo diferente do que vai acontecer.
    const screeningConfigurado = resolveScreeningProvider(app.env);
    const screening: ScreeningProviderMode =
      screeningConfigurado === 'FAKE' ||
      screeningConfigurado === 'SERASA' ||
      screeningConfigurado === 'SPC'
        ? screeningConfigurado
        : null;

    const payments = (app.payments?.name ?? null) as PaymentProviderMode;
    const signature = (app.signature?.name ?? null) as SignatureProviderMode;

    return capabilitiesResponseSchema.parse({
      providers: {
        payments,
        signature,
        screening,
        meta: resolveMetaMode(app.env) ?? null,
      },
    });
  });

  return Promise.resolve();
};
