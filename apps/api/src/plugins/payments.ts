import fp from 'fastify-plugin';
import { getPaymentProvider } from '@aluguei/integrations';
import type { FakePaymentStore, IPaymentProvider } from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    payments: IPaymentProvider | null;
  }
}

export interface PaymentsPluginOptions {
  provider?: string;
  apiKey?: string;
  env?: 'sandbox' | 'production';
  payments?: IPaymentProvider;
  /** Estado do FAKE compartilhado com o worker (tabela) — dev/E2E. */
  fakeStore?: FakePaymentStore;
}

/** Registra `app.payments` (FAKE em dev/test; ASAAS sem chave é null). */
export const paymentsPlugin = fp<PaymentsPluginOptions>((app, opts) => {
  const options: Parameters<typeof getPaymentProvider>[0] = {};
  if (opts.payments) {
    options.fake = opts.payments;
  }
  if (opts.provider) {
    options.provider = opts.provider;
  }
  if (opts.apiKey) {
    options.apiKey = opts.apiKey;
  }
  if (opts.env) {
    options.env = opts.env;
  }
  if (opts.fakeStore) {
    options.fakeStore = opts.fakeStore;
  }
  app.decorate('payments', getPaymentProvider(options));
});
