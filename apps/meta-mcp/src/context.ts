import { loadEnv } from '@aluguei/config';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { getMetaAdsProvider } from '@aluguei/integrations';
import type { IMetaAdsProvider } from '@aluguei/integrations';

export interface McpContext {
  db: AppDb;
  meta: IMetaAdsProvider | null;
  metaMode: 'dry_run' | 'live';
}

export interface CreateContextOptions {
  db?: AppDb;
  meta?: IMetaAdsProvider | null;
  metaMode?: 'dry_run' | 'live';
}

/** Constrói o contexto do servidor MCP a partir do ambiente (sem token no LLM). */
export function createContext(options: CreateContextOptions = {}): McpContext {
  if (options.db) {
    return {
      db: options.db,
      meta: options.meta ?? getMetaAdsProvider({ mode: 'dry_run' }),
      metaMode: options.metaMode ?? 'dry_run',
    };
  }
  const env = loadEnv();
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente — o MCP aluguei-meta precisa do Postgres');
  }
  const db = createDb(env.DATABASE_URL);
  const metaOptions: Parameters<typeof getMetaAdsProvider>[0] = {};
  if (env.META_MODE === 'live') {
    metaOptions.mode = 'live';
    if (env.META_ACCESS_TOKEN) {
      metaOptions.accessToken = env.META_ACCESS_TOKEN;
    }
  } else {
    metaOptions.mode = 'dry_run';
  }
  const meta = getMetaAdsProvider(metaOptions);
  return {
    db,
    meta,
    metaMode: env.META_MODE === 'live' ? 'live' : 'dry_run',
  };
}
