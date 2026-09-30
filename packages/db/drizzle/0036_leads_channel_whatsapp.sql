-- Onda 0 da rodada de fidelidade, defeito 11: a origem do lead que chega pelo WhatsApp era
-- gravada como 'whatsapp', fora do vocabulario de leads.channel (PORTAL, WHATSAPP, INDICACAO,
-- META, MANUAL). O filtro "WHATSAPP" do pipeline compara igual e nunca achava esses leads.
-- O atendimento passa a gravar 'WHATSAPP'; aqui as linhas ja gravadas entram no mesmo
-- vocabulario. Idempotente: rodar de novo nao muda nada.
UPDATE "leads" SET "channel" = 'WHATSAPP' WHERE "channel" = 'whatsapp';
