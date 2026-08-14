import fp from 'fastify-plugin';
import { getPaymentProvider } from '@aluguei/integrations';
import type { IPaymentProvider } from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    payments: IPaymentProvider | null;
  }
}

export interface PaymentsPluginOptions {
  provider?: string;
  apiKey?: string;
  payments?: IPaymentProvider;
}

/** Registra `app.payments` (FAKE em dev/test; ASAAS sem chave → null). */
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
  app.decorate('payments', getPaymentProvider(options));
});
