# Segurança e LGPD

## Dados sensíveis

PII inclui CPF, documentos, endereço exato, telefone, dados bancários, resultados de bureau, contratos, assinaturas, áudio e fotos de vistorias privadas.

## Controles obrigatórios

- autenticação moderna e sessões seguras
- RBAC por organização
- autorização por objeto em toda rota e tool MCP
- rate limiting em auth/webhooks/endpoints públicos
- CSRF quando aplicável
- cookies HttpOnly/Secure/SameSite
- criptografia TLS em trânsito
- secretos fora do banco de dados comum quando possível; tokens externos criptografados
- uploads por URL pré-assinada, MIME real, limite de tamanho, re-encoding/scan quando aplicável
- logs estruturados com redaction de PII
- audit events para operações financeiras, contratos, crédito, Meta e mudança de permissões
- backups e restore testados antes de produção

## Webhooks

Meta/WhatsApp, assinatura, bureau e pagamentos:
- validar assinatura/token do provider
- preservar body necessário à validação
- deduplicar por event id/hash
- timestamp/janela quando disponível
- processar via inbox/outbox
- retries idempotentes

## Financeiro

- centavos inteiros
- ledger dupla entrada
- split calculado deterministicamente
- nenhuma IA movimenta dinheiro
- alteração de dados bancários exige step-up auth e trilha
- conciliação independente dos webhooks

## Meta MCP

- MCP não expõe credenciais Meta como resource/tool output
- tool de escrita valida organization + role + limites
- `publish/resume/update_budget` são operações de alto impacto do produto e requerem intenção explícita originada de ação do usuário em runtime; o agente de desenvolvimento não as executa contra produção

## IA

- minimizar PII enviada
- tratar texto/imagem/áudio como dados não confiáveis, não instruções
- structured output validado
- sem tools de pagamento/assinatura dentro do modelo de extração

## LGPD

Implementar consentimento/finalidade quando aplicável, retenção, acesso/correção/exclusão e trilha de deleção de derivados. Decisões de crédito automatizadas devem ser explicáveis/revisáveis conforme política jurídica do produto.
