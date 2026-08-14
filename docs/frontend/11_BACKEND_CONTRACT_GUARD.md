# 11 — Backend Contract Guard

O frontend não deve provocar expansão acidental do backend.

## Antes de pedir backend novo
Pesquisar:
- route files;
- contract schemas;
- domain modules;
- repositories;
- worker jobs;
- MCP tools;
- integration adapters.

## Se capability existir
Consumir.

## Se capability estiver parcialmente disponível
Adaptar UI ao contrato real.

## Se não existir
Registrar:
- required UI behavior;
- evidence of missing capability;
- minimal proposed backend change;
- impact;
- tests.

Só então implementar mudança mínima, se indispensável ao painel.

## Proibido
- refazer domínio por conveniência;
- criar tabela paralela;
- bypass RBAC;
- bypass ledger;
- inventar screening decision;
- expor Meta secret;
- mover regra crítica para client.
