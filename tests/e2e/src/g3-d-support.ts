import { expect } from '@playwright/test';
import { api } from './g2-b1-support';
import type { Account } from './g2-b1-support';

/**
 * Apoio dos specs da trilha D do G3 (cadastros e identidade). A caixa de saída de e-mail é local:
 * nada é enviado. O link de um e-mail é lido pela rota de dev `GET /dev/email-outbox`, que só
 * existe fora de produção (como `/dev/fake-payments`).
 */

export interface IdBody {
  id: string;
}

/** Id do usuário da sessão. */
export async function userIdOf(account: Account): Promise<string> {
  const me = await api<{ user: IdBody }>('GET', '/auth/me', { cookie: account.cookie });
  expect(me.status, 'GET /auth/me').toBe(200);
  return me.body.user.id;
}

/** Acrescenta a conta `member` à imobiliária de `owner` com a função dada. */
export async function addMember(owner: Account, member: Account, role: string): Promise<string> {
  const userId = await userIdOf(member);
  const res = await api('POST', `/organizations/${owner.orgId}/members`, {
    cookie: owner.cookie,
    json: { userId, role },
  });
  expect(res.status, 'vínculo do colega').toBe(201);
  return userId;
}

/** Token do link da mensagem mais recente da caixa de saída local para `to`. */
export async function outboxToken(
  to: string,
  kind: 'PASSWORD_RESET' | 'MEMBER_INVITE',
): Promise<string> {
  const res = await api<{ messages: Array<{ body: string; status: string }> }>(
    'GET',
    `/dev/email-outbox?to=${encodeURIComponent(to)}&kind=${kind}`,
  );
  expect(res.status, 'caixa de saída de dev').toBe(200);
  const [message] = res.body.messages;
  expect(message?.status, 'mensagem registrada e não enviada').toBe('QUEUED');
  const match = /token=([A-Za-z0-9_-]+)/.exec(message?.body ?? '');
  expect(match?.[1], 'link com token na mensagem').toBeTruthy();
  return match?.[1] ?? '';
}

/** `AAAA-MM-DD` de hoje + `days` no fuso de São Paulo. */
export function spDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const date = new Date(`${today}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
