# G3 — Plano de execução (Fases 5 e 6)

Critério do gate (`14_CONTINUATION_PLAN.md`, §5): **regras e ciclos de vida + operação mínima
(fail-fast, logs de job, OTEL, backup automatizado)**. Base: `main` em `3aa922b` (G2 implantado,
Postgres embutido fora do compose). Autorização do usuário em 2026-09-17: executar tudo, com merge e
deploy.

As regras de execução continuam as do G1 e do G2:

- **Teste antes da correção.** Todo defeito vira teste permanente, que precisa falhar antes da
  correção (RED) e passar depois (GREEN), com evidência em `docs/audits/2026-09-10/evidence/g3/`.
- **Sem efeito externo.** Providers FAKE, Meta em dry-run e IA mock. Nenhum e-mail, WhatsApp, cobrança
  ou consulta real: envio de e-mail vai para uma caixa de saída local (FAKE).
- **Gates sem cache.** Nenhum teste ignorado e nenhuma asserção afrouxada. O orquestrador roda de novo
  o que uma trilha disse que passou.
- **Referência Kal El só para interface.** Componentes, tokens e padrões de tela; o Aluguei.app
  continua sendo a fonte de verdade funcional.

## Trilhas

As trilhas que mudam o schema do banco rodam em sequência (C → D → E → G), porque as migrations do
drizzle formam uma cadeia. A trilha F não muda o schema e roda em paralelo.

| Trilha                              | Achados                                                        | Escopo                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C — Finanças e locação**          | P1-07, P1-08, P1-20                                            | Multa e juros por locação (padrão: multa de 2% e juros de 1% ao mês pro rata die, com limites), vencimento em dia útil no fuso de São Paulo, repasse por coproprietário (participações somando 100%), renovar, reajustar e encerrar a locação, e scheduler que só cobra locações ativas                                                                                                                                                                                        |
| **D — Cadastros e identidade**      | P2-01, P2-02, P2-03, P2-04                                     | Pessoas: detalhe, edição, arquivamento, dígito verificador de CPF e CNPJ e documentos. Visitas: confirmar, reagendar, cancelar, não comparecimento, realizada. Propostas: enviar, aceitar, recusar, expirar, com job de expiração. Lead: detalhe, edição e responsável. Senha: troca e recuperação. Convite de membro por e-mail (caixa de saída FAKE)                                                                                                                         |
| **E — Portal, vistoria e WhatsApp** | P2-05, P1-24, P1-18                                            | Extrato do portal sem cobranças canceladas; locatário só vê vistorias permitidas; QR do caminho idempotente; índice parcial de concessão ativa (pendência do ADR-061). Evidência de vistoria imutável depois de COMPLETED, com auditoria. Handoff do WhatsApp que persiste até a equipe devolver a conversa, e prova de posse do número                                                                                                                                        |
| **F — Operação e observabilidade**  | P1-12, P1-14, P1-15, P2-10, P2-11, runner de migration (P2-12) | Fail-fast de configuração em produção, com permissão explícita para providers FAKE na homologação; `.env.example` completo; `REDIS_URL` sem derrubar a API; flag explícita para API interna http no web. Worker com log por job, health HTTP e shutdown gracioso. OTEL com spans de HTTP e pg na API e no worker; captura de erro; redação de CPF, e-mail, telefone e cookie nos logs; `audit_events.payload` com diff sem dado pessoal; runner de migration com advisory lock |
| **F2 — Backup e restauração**       | Fase 6 (backup)                                                | Backup com `pg_dump`, retenção e criptografia; script de restauração testado de forma automatizada. A cópia fora do servidor depende de destino do usuário (Fase 7)                                                                                                                                                                                                                                                                                                            |
| **G — Banco**                       | P2-12                                                          | CHECK nas colunas de domínio fechado, `bigint` nos totais em centavos e índices parciais declarados no schema; por último, depois das trilhas C, D e E                                                                                                                                                                                                                                                                                                                         |

Cada trilha fecha com os aceites do plano:

- **C, D, E:** testes unitários de domínio (juros, split em N partes), integração por endpoint novo e
  Playwright dos ciclos pela interface.
- **F:** boot de produção sem variável obrigatória falha com mensagem clara; spans visíveis num
  coletor local; job com falha gera log de erro.
- **F2:** a restauração automatizada passa.
- **G:** migration com pré-voo que aborta diante de dado fora do domínio.

## Entrega

Cada trilha vira um PR próprio sobre `main`, com evidência RED e GREEN, gates sem cache, `test:pg` e
Playwright completo. Depois do merge, a trilha é implantada na homologação e passa pelo smoke. Os
rascunhos de ADR de cada trilha são consolidados em `docs/DECISIONS.md` a partir do ADR-063. O
relatório do gate fica em `docs/audits/2026-09-10/G3_EXECUTION_REPORT.md`.

## Decisões assumidas (revisáveis)

- **Juros e multa.** Juros de mora de 1% ao mês, calculados pro rata die, com teto de 1% ao mês na
  configuração. Multa com teto de 10%. Os dois incidem sobre o valor em atraso (aluguel e encargos
  da cobrança).
- **Dia útil.** Sábado, domingo e feriado nacional (datas fixas e móveis) levam o vencimento ao dia
  útil seguinte, no calendário de São Paulo. Feriados estaduais e municipais ficam fora.
- **Homologação.** `NODE_ENV=production` com providers FAKE só é aceito com uma permissão explícita
  no compose da homologação; sem ela, a API e o worker não sobem.
- **E-mail.** Recuperação de senha e convite de membro gravam a mensagem numa caixa de saída local,
  visível a quem opera a homologação. O envio real fica para a Fase 7.
