import type { SelectOption } from '@aluguei/ui';
import { CHANNEL_TYPE_LABELS, label } from './labels';

/**
 * Primeira publicação de um anúncio em canal pela tela (auditoria 2026-09-10,
 * P1-17). A lista de canais vem de `GET /channels`: canal sem integração
 * configurada aparece desabilitado. Módulo puro.
 */

export interface AvailableChannel {
  channel: string;
  available: boolean;
}

export function channelSelectOptions(channels: readonly AvailableChannel[]): SelectOption[] {
  return channels.map(({ channel, available }) =>
    available
      ? { value: channel, label: label(CHANNEL_TYPE_LABELS, channel) }
      : {
          value: channel,
          label: `${label(CHANNEL_TYPE_LABELS, channel)} (sem integração)`,
          disabled: true,
        },
  );
}
