# 05 — Route Matrix

O agente deve descobrir as rotas reais existentes e adaptar este mapa sem inventar endpoint.

Sugestão canônica:

- `/app`
- `/app/inbox`
- `/app/crm/leads`
- `/app/crm/leads/[id]`
- `/app/crm/pipeline`
- `/app/crm/contacts`
- `/app/crm/tasks`
- `/app/crm/calendar`
- `/app/properties`
- `/app/properties/[id]`
- `/app/properties/new`
- `/app/listings`
- `/app/channels`
- `/app/visits`
- `/app/proposals`
- `/app/screening`
- `/app/contracts`
- `/app/contracts/[id]`
- `/app/contract-templates`
- `/app/inspections`
- `/app/inspections/[id]`
- `/app/leases`
- `/app/leases/[id]`
- `/app/finance`
- `/app/charges`
- `/app/payments`
- `/app/payouts`
- `/app/reconciliation`
- `/app/ledger`
- `/app/marketing`
- `/app/meta`
- `/app/reporting`
- `/app/documents`
- `/app/admin/members`
- `/app/admin/permissions`
- `/app/admin/audit`
- `/app/admin/integrations`
- `/app/settings`

## Regra
Mapear cada rota para:
- endpoint(s);
- contract(s);
- permission(s);
- states;
- E2E;
- design pattern.

Se naming atual do repo for diferente, preservar convenção real.
