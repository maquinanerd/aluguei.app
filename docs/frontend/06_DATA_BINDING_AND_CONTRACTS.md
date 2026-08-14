# 06 — Data Binding & Contracts

## Fonte de verdade
`packages/contracts` e API real.

## Proibido
- duplicar Zod schemas;
- criar tipos divergentes;
- usar `any` para contornar contract;
- inventar campo;
- colocar regra financeira no component;
- calcular autorização somente no client.

## Query layer
Criar/usar cliente HTTP único.
Centralizar:
- base URL;
- credentials/cookies;
- erros;
- request id;
- parsing;
- schema validation;
- abort signal.

## Mutations
- impedir double submit;
- idempotency quando endpoint suportar;
- invalidate/refetch correta;
- optimistic update somente quando seguro;
- mapear DomainError/status HTTP para feedback legível.

## States
Cada query:
loading / empty / error / retry / success / permission denied / partial quando aplicável.

## RBAC
Ocultar/desabilitar ações conforme permissão para UX, mas servidor continua autoridade.

## Money
Sempre partir de centavos canônicos.
Formatting é responsabilidade de apresentação; cálculo financeiro permanece no domínio/backend.

## Dates
Respeitar UTC/canonical model; converter para locale apenas na apresentação.
