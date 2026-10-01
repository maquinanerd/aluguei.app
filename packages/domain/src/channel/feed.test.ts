import { describe, expect, it } from 'vitest';
import { FEED_DESIRED_STATUSES, isFeedDesiredStatus, nextFeedStatus } from './feed.js';
import { CHANNEL_PUBLICATION_STATUSES } from './publication.js';

describe('ciclo do anúncio no modo FEED (ADR-107)', () => {
  it('estados desejados são todos estados de publicação conhecidos', () => {
    for (const status of FEED_DESIRED_STATUSES) {
      expect(CHANNEL_PUBLICATION_STATUSES).toContain(status);
    }
    expect(isFeedDesiredStatus('REMOVING')).toBe(false);
    expect(isFeedDesiredStatus('REMOVED')).toBe(false);
    expect(isFeedDesiredStatus('ELIGIBLE')).toBe(true);
  });

  it('avaliação: inválido bloqueia, válido libera, e o que já foi ao portal fica onde está', () => {
    expect(nextFeedStatus('PENDING', { kind: 'EVALUATED', eligible: false })).toBe('BLOCKED');
    expect(nextFeedStatus('PENDING', { kind: 'EVALUATED', eligible: true })).toBe('ELIGIBLE');
    expect(nextFeedStatus('BLOCKED', { kind: 'EVALUATED', eligible: true })).toBe('ELIGIBLE');
    expect(nextFeedStatus('FAILED', { kind: 'EVALUATED', eligible: true })).toBe('ELIGIBLE');
    expect(nextFeedStatus('IMPORTED', { kind: 'EVALUATED', eligible: true })).toBe('IMPORTED');
    expect(nextFeedStatus('IMPORTED', { kind: 'EVALUATED', eligible: false })).toBe('BLOCKED');
    expect(nextFeedStatus('REMOVING', { kind: 'EVALUATED', eligible: true })).toBe('REMOVING');
  });

  it('busca do robô: entrar no arquivo vira "aguardando relatório", não "publicado"', () => {
    const fetched = { kind: 'CRAWLER_FETCH', included: true, contentChanged: true } as const;
    expect(nextFeedStatus('ELIGIBLE', fetched)).toBe('AWAITING_IMPORT');
    expect(nextFeedStatus('BLOCKED', fetched)).toBe('AWAITING_IMPORT');
    expect(nextFeedStatus('IMPORTED', fetched)).toBe('AWAITING_IMPORT');
  });

  it('busca do robô sem mudança mantém o que o relatório disse', () => {
    const same = { kind: 'CRAWLER_FETCH', included: true, contentChanged: false } as const;
    expect(nextFeedStatus('IMPORTED', same)).toBe('IMPORTED');
    expect(nextFeedStatus('IMPORT_ERROR', same)).toBe('IMPORT_ERROR');
    expect(nextFeedStatus('ELIGIBLE', same)).toBe('AWAITING_IMPORT');
  });

  it('busca do robô: fora do arquivo por dado inválido bloqueia; remoção conclui', () => {
    const left = { kind: 'CRAWLER_FETCH', included: false, contentChanged: false } as const;
    expect(nextFeedStatus('IMPORTED', left)).toBe('BLOCKED');
    expect(nextFeedStatus('REMOVING', left)).toBe('REMOVED');
  });

  it('remoção: sai direto se o robô nunca levou; senão espera a próxima busca', () => {
    expect(nextFeedStatus('ELIGIBLE', { kind: 'REMOVE_REQUESTED', everInFeed: false })).toBe(
      'REMOVED',
    );
    expect(nextFeedStatus('IMPORTED', { kind: 'REMOVE_REQUESTED', everInFeed: true })).toBe(
      'REMOVING',
    );
    expect(nextFeedStatus('REMOVED', { kind: 'REMOVE_REQUESTED', everInFeed: true })).toBe(
      'REMOVED',
    );
  });

  it('pedir de novo reabre a avaliação só de quem saiu ou falhou', () => {
    expect(nextFeedStatus('REMOVED', { kind: 'PUBLISH_REQUESTED' })).toBe('PENDING');
    expect(nextFeedStatus('REMOVING', { kind: 'PUBLISH_REQUESTED' })).toBe('PENDING');
    expect(nextFeedStatus('FAILED', { kind: 'PUBLISH_REQUESTED' })).toBe('PENDING');
    expect(nextFeedStatus('IMPORTED', { kind: 'PUBLISH_REQUESTED' })).toBe('IMPORTED');
  });

  it('relatório só muda anúncio que o robô já levou', () => {
    expect(nextFeedStatus('AWAITING_IMPORT', { kind: 'REPORT', outcome: 'OK' })).toBe('IMPORTED');
    expect(nextFeedStatus('AWAITING_IMPORT', { kind: 'REPORT', outcome: 'ERROR' })).toBe(
      'IMPORT_ERROR',
    );
    expect(nextFeedStatus('IMPORTED', { kind: 'REPORT', outcome: 'WARNING' })).toBe(
      'IMPORTED_WITH_WARNINGS',
    );
    expect(nextFeedStatus('IMPORT_ERROR', { kind: 'REPORT', outcome: 'OK' })).toBe('IMPORTED');
    expect(nextFeedStatus('ELIGIBLE', { kind: 'REPORT', outcome: 'ERROR' })).toBe('ELIGIBLE');
    expect(nextFeedStatus('BLOCKED', { kind: 'REPORT', outcome: 'OK' })).toBe('BLOCKED');
  });
});
