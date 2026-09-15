-- Envelope com o provider real e o hash do documento enviado (auditoria 2026-09-10,
-- P1-11, parte interna — Gate G2). Até aqui a API gravava provider 'FAKE' fixo e
-- mandava o hash do texto no lugar do documento; agora grava o provider
-- configurado e o SHA-256 do PDF enviado. Editada à mão: pré-voo antes da coluna.
--
-- Pré-voo: aborta, sem alterar nada, se houver envelope que o defeito deixou
-- órfão — gravado como FAKE com id que não é do provider FAKE, que o webhook do
-- provider real nunca localizaria — ou com provider desconhecido.
DO $$
DECLARE
  v record;
  msg text := '';
BEGIN
  FOR v IN
    WITH violacoes(problema, envelope_id) AS (
      SELECT 'gravado como FAKE com id de outro provider', e.id::text
        FROM signature_envelopes e
        WHERE e.provider = 'FAKE' AND e.provider_envelope_id NOT LIKE 'env.fake.%'
      UNION ALL SELECT 'provider desconhecido', e.id::text
        FROM signature_envelopes e
        WHERE e.provider NOT IN ('CLICKSIGN', 'D4SIGN', 'FAKE')
    )
    SELECT problema, count(*)::int AS total, min(envelope_id) AS exemplo
    FROM violacoes GROUP BY problema ORDER BY problema
  LOOP
    msg := msg || format('%s: %s envelope(s) (ex.: %s); ', v.problema, v.total, v.exemplo);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION 'Migracao 0016 abortada: envelopes de assinatura inconsistentes -- %', msg
      USING HINT = 'Confirme no provider o envelope de cada linha e corrija provider/id antes de aplicar (docs/audits/2026-09-10).';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "document_hash" text;
