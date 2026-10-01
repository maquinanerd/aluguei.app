import type { ChannelPublicationStatus } from './publication.js';

/**
 * Ciclo de um anúncio num canal de modo FEED (Grupo OLX, ADR-107).
 *
 * No feed o sistema não chama o portal: publicar é tornar o anúncio elegível para o arquivo que o
 * portal busca de tempos em tempos. Por isso "entrou no XML" e "está publicado no portal" são
 * estados diferentes, e o que diz se o portal aceitou é o relatório de importação.
 *
 * - `PENDING`: pedido registrado, ainda não avaliado.
 * - `BLOCKED`: falta dado exigido pelo portal; não entra no arquivo (motivos em `issues`).
 * - `ELIGIBLE`: entra no próximo arquivo que o robô buscar.
 * - `AWAITING_IMPORT`: o robô levou esta versão do anúncio; falta o relatório.
 * - `IMPORTED` / `IMPORTED_WITH_WARNINGS` / `IMPORT_ERROR`: o que o relatório disse.
 * - `REMOVING`: saiu do arquivo, mas o robô ainda não buscou a versão sem ele.
 * - `REMOVED`: o robô já buscou um arquivo sem ele (ou ele nunca chegou a ir).
 * - `FAILED`: erro interno ao avaliar; o anúncio continua desejado e volta a ser avaliado.
 */

/** Estados em que o anúncio continua desejado no feed (o arquivo reavalia e decide). */
export const FEED_DESIRED_STATUSES = [
  'PENDING',
  'FAILED',
  'BLOCKED',
  'ELIGIBLE',
  'AWAITING_IMPORT',
  'IMPORTED',
  'IMPORTED_WITH_WARNINGS',
  'IMPORT_ERROR',
] as const satisfies readonly ChannelPublicationStatus[];

/** Estados que o relatório de importação pode mudar: o robô já levou o anúncio. */
const AFTER_FETCH: readonly ChannelPublicationStatus[] = [
  'AWAITING_IMPORT',
  'IMPORTED',
  'IMPORTED_WITH_WARNINGS',
  'IMPORT_ERROR',
];

export type FeedEvent =
  /** Avaliação dos dados (publicar, imóvel alterado, reconciliação). */
  | { kind: 'EVALUATED'; eligible: boolean }
  /**
   * O robô do portal buscou o arquivo. `included`: o anúncio foi no arquivo (desejado e válido).
   * `contentChanged`: a versão que foi difere da última que o robô levou.
   */
  | { kind: 'CRAWLER_FETCH'; included: boolean; contentChanged: boolean }
  /** A imobiliária tirou o anúncio do canal. `everInFeed`: o robô chegou a levar o anúncio. */
  | { kind: 'REMOVE_REQUESTED'; everInFeed: boolean }
  /** A imobiliária pediu de novo a publicação. */
  | { kind: 'PUBLISH_REQUESTED' }
  /** Relatório de importação: crítica, aviso ou nada sobre este anúncio. */
  | { kind: 'REPORT'; outcome: 'ERROR' | 'WARNING' | 'OK' };

export function isFeedDesiredStatus(status: string): boolean {
  return (FEED_DESIRED_STATUSES as readonly string[]).includes(status);
}

/** Próximo estado do anúncio no feed. Puro: quem grava é a API, o worker ou a rota do feed. */
export function nextFeedStatus(
  current: ChannelPublicationStatus,
  event: FeedEvent,
): ChannelPublicationStatus {
  const removal = current === 'REMOVING' || current === 'REMOVED';
  switch (event.kind) {
    case 'PUBLISH_REQUESTED':
      // Pedir de novo reabre a avaliação; o que já foi ao portal continua onde está.
      return removal || current === 'FAILED' ? 'PENDING' : current;
    case 'EVALUATED':
      if (removal) return current;
      if (!event.eligible) return 'BLOCKED';
      // A mudança de conteúdo só vira "aguardando" quando o robô levar a versão nova.
      return current === 'PENDING' || current === 'FAILED' || current === 'BLOCKED'
        ? 'ELIGIBLE'
        : current;
    case 'CRAWLER_FETCH':
      if (removal) return 'REMOVED';
      if (!event.included) return 'BLOCKED';
      if (event.contentChanged || !AFTER_FETCH.includes(current)) return 'AWAITING_IMPORT';
      return current;
    case 'REMOVE_REQUESTED':
      if (current === 'REMOVED') return current;
      return event.everInFeed ? 'REMOVING' : 'REMOVED';
    case 'REPORT':
      if (!AFTER_FETCH.includes(current)) return current;
      if (event.outcome === 'ERROR') return 'IMPORT_ERROR';
      if (event.outcome === 'WARNING') return 'IMPORTED_WITH_WARNINGS';
      return 'IMPORTED';
  }
}
