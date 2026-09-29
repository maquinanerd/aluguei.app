import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { parties, partyIdentities, portalAccess } from '@aluguei/db';
import { normalizeEmail } from '@aluguei/domain';
import {
  requestPortalLinkRequestSchema,
  requestPortalLinkResponseSchema,
} from '@aluguei/contracts';
import { generatePortalToken, hashPortalToken } from '../plugins/portal-session.js';
import { queueEmail } from '../email-outbox.js';

/**
 * Pedido de link de acesso pelo próprio inquilino ou proprietário (Onda 6).
 *
 * Até aqui só a imobiliária criava o link. Quem perdeu o link não tinha como
 * pedir outro sem ligar para a imobiliária — e é justamente quem já é cliente.
 *
 * Três decisões de segurança moram aqui:
 *
 * 1. **A resposta é sempre a mesma.** Com contato cadastrado ou não, com
 *    concessão ativa ou não. Diferenciar transformaria a rota num verificador de
 *    "esta pessoa é cliente desta imobiliária", que é informação de terceiro.
 * 2. **O link pedido dura 15 minutos**, não os 7 dias do link entregue pela
 *    imobiliária. Quem pede está com a tela aberta agora; prazo longo aqui só
 *    aumenta a janela de um link vazado.
 * 3. **Nada é enviado de verdade ainda.** A mensagem vai para a caixa de saída
 *    local, como toda mensagem do sistema. A tela diz o que acontece de fato,
 *    em vez de prometer um WhatsApp que ninguém manda.
 */

/** Prazo curto de propósito: quem pede está usando a tela agora. */
const PEDIDO_TTL_MS = 15 * 60 * 1000;

/** `(62) 9 8812-5678` e `62988125678` são o mesmo contato. */
function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export const portalRequestLinkRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/portal/auth/request-link',
    // Mais apertado que o padrão: é rota pública que dispara mensagem.
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const input = requestPortalLinkRequestSchema.parse(request.body);
      const contato = input.contact.trim();
      const ehEmail = contato.includes('@');
      const valor = ehEmail ? normalizeEmail(contato) : apenasDigitos(contato);

      // Busca por identidade, sem filtrar por imobiliária: quem pede não sabe
      // (nem precisa saber) em qual imobiliária está cadastrado.
      const identidades =
        valor === ''
          ? []
          : await db
              .select({ partyId: partyIdentities.partyId, orgId: partyIdentities.orgId })
              .from(partyIdentities)
              .where(
                and(
                  eq(partyIdentities.kind, ehEmail ? 'EMAIL' : 'PHONE'),
                  eq(partyIdentities.value, valor),
                ),
              );

      for (const identidade of identidades) {
        const [concessao] = await db
          .select({ id: portalAccess.id, kind: portalAccess.kind })
          .from(portalAccess)
          .where(
            and(
              eq(portalAccess.orgId, identidade.orgId),
              eq(portalAccess.partyId, identidade.partyId),
              isNull(portalAccess.revokedAt),
            ),
          )
          .orderBy(desc(portalAccess.createdAt))
          .limit(1);
        if (!concessao) {
          continue;
        }

        const token = generatePortalToken();
        await db
          .update(portalAccess)
          .set({
            oneTimeTokenHash: hashPortalToken(token),
            oneTimeTokenExpiresAt: new Date(Date.now() + PEDIDO_TTL_MS),
          })
          .where(eq(portalAccess.id, concessao.id));

        // O e-mail sai para o contato informado quando ele é e-mail; por
        // telefone, o destino é o e-mail cadastrado da pessoa, porque a caixa
        // de saída é de e-mail e não existe canal de WhatsApp saindo daqui.
        const [destinatario] = ehEmail
          ? [{ value: valor }]
          : await db
              .select({ value: partyIdentities.value })
              .from(partyIdentities)
              .where(
                and(
                  eq(partyIdentities.partyId, identidade.partyId),
                  eq(partyIdentities.orgId, identidade.orgId),
                  eq(partyIdentities.kind, 'EMAIL'),
                ),
              )
              .limit(1);
        if (!destinatario) {
          continue;
        }

        const [pessoa] = await db
          .select({ name: parties.name })
          .from(parties)
          .where(and(eq(parties.id, identidade.partyId), eq(parties.orgId, identidade.orgId)))
          .limit(1);

        await queueEmail(db, {
          orgId: identidade.orgId,
          kind: 'PORTAL_ACCESS_LINK',
          toEmail: destinatario.value,
          subject: 'Seu link de acesso',
          body: [
            `Olá${pessoa?.name === undefined ? '' : `, ${pessoa.name}`}.`,
            '',
            'Use o link abaixo para abrir sua área. Ele vale por 15 minutos e só pode ser usado uma vez.',
            `${app.config.appBaseUrl}/portal/entrar?token=${token}`,
          ].join('\n'),
          relatedEntityType: 'PORTAL_ACCESS',
          relatedEntityId: concessao.id,
        });
      }

      // Sempre a mesma resposta: a rota não diz quem é cliente de quem.
      return requestPortalLinkResponseSchema.parse({ ok: true });
    },
  );

  return Promise.resolve();
};
