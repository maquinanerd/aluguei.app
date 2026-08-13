# Estratégia de testes

## Pirâmide

### Unitários

Domínio: estados, cálculos, split, ledger, políticas, parsing, autorização pura.

### Integração

PostgreSQL/repositories, filas, storage adapter, webhooks, Meta adapter com mock server/fixtures, Asaas sandbox/fixtures quando possível.

### Contrato

Schemas de providers e MCP tools. Fixtures devem preservar respostas reais sanitizadas quando obtidas legalmente.

### E2E

Fluxos críticos:

1. imóvel → anúncio no site
2. lead → visita → proposta
3. vistoria com mídia → revisão → relatório
4. application → screening mock → contrato → assinatura mock
5. cobrança → pagamento webhook → ledger/split → payout
6. imóvel → Meta prepared campaign → created PAUSED em mock/sandbox → insights

## Gates

- zero type errors
- lint limpo
- testes críticos verdes
- migration sobe do zero e rollback/recovery documentado
- sem segredo detectado
- scans de dependência
- testes de autorização cross-organization

## TDD

Em bug e regra de domínio, escrever teste RED antes da correção. Em scaffolding inicial, permitir criação incremental mas exigir teste antes de concluir a feature.
