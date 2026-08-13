# Integrações externas

## Regra para todos os providers

Cada integração possui interface local, adapter, configuração tipada, testes por contrato/fixture e estado de reconciliação. SDKs externos não vazam para o domínio.

## Google

Uso: autocomplete/endereço, geocoding, mapa e validação de endereço quando contratado.

## WhatsApp / Meta

Uso: mensagens, webhooks, templates, identificação do lead/imóvel e atendimento inicial.

## Portais imobiliários

Criar `IListingChannelAdapter` com operações conceituais:

- validate
- publish
- update
- remove
- reconcile
- importLeads quando suportado

Cada canal pode usar REST, XML/feed, SFTP, webhook ou outra modalidade contratada. O agente DEVE pesquisar a documentação oficial/contratual vigente antes de implementar chamadas reais. Se não houver acesso, entregar adapter e fixtures sem inventar endpoint.

## Crédito/identidade

`IScreeningProvider` e adapters Serasa/SPC/outros. Consentimento e finalidade registrados antes da consulta.

## Assinatura

`ISignatureProvider`: baseline Clicksign, alternativa D4Sign. Webhook idempotente, hash do documento e trilha de eventos.

## Pagamento

`IPaymentProvider`: baseline Asaas em sandbox. Suportar criação de cobrança, status, cancelamento/estorno quando disponível, split e payout/reconciliação.

## Meta Marketing

Detalhado em `docs/META_MCP.md`.
