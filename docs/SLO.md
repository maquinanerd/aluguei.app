# SLOs — Aluguei.app

Objetivos de nível de serviço iniciais (Fase 11). Métricas coletáveis com a observabilidade existente (`@aluguei/observability`: pino + OTEL) e health checks da API.

## Objetivos

| SLO                                               | Alvo                                                 | Janela   | Medição                                               |
| ------------------------------------------------- | ---------------------------------------------------- | -------- | ----------------------------------------------------- |
| Disponibilidade do plano de dados (API + DB)      | 99.9%                                                | mensal   | `/health/ready` (probe) — erros 5xx / total de probes |
| Latência p95 da API (exclui webhooks/exportações) | < 300ms                                              | mensal   | spans OTEL / logs de request                          |
| Erros 5xx da API                                  | < 0.5% das requisições                               | mensal   | logs de request (`status_code >= 500`)                |
| Erros 4xx de webhooks conhecidos (200 imediato)   | = 0% de retry infinito                               | mensal   | jobs em `webhook_inbox` com attempts ≥ 5              |
| Jobs processados em até 1 ciclo de poll           | ≥ 99%                                                | mensal   | `run_at <= now()` vs `started_at`                     |
| RPO                                               | ≤ 24h (backup diário; PITR ≤ 5min quando habilitado) | contínuo | docs/OPERATIONS.md                                    |
| RTO                                               | ≤ 4h (restore guiado)                                | contínuo | docs/OPERATIONS.md                                    |

## Burn rate e alertas

- **Critério de alerta p95 > 300ms por 10 min** → investigar query/índice.
- **5xx > 0.5% por 10 min** → verificar DB (`/health/ready`) e dependências.
- **`/health/ready` 503 por 3 probes consecutivas** → P1.
- **Jobs com attempts ≥ 5 (qualquer fila)** → P2 (re-enfileiramento manual).

## Limitações

- Sem infraestrutura de métricas de produção implantada (OTEL exporter opcional); SLOs definem alvos e medidores, a coleta em produção fica para a implantação (fora do MVP).
- Mobile/offline: sem SLO de sincronização definido até o app ter sync resiliente.
