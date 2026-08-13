# Produto — Aluguei.app

## Objetivo

Criar um CRM + site + aplicativo para imobiliárias operarem locação de ponta a ponta em um único sistema independente.

## Personas

- gestor da imobiliária
- corretor/atendente
- vistoriador
- financeiro
- proprietário
- locatário/candidato

## Fluxo principal

`IMÓVEL → ANÚNCIO → LEAD → ATENDIMENTO → VISITA → PROPOSTA → ANÁLISE CADASTRAL → CONTRATO → ASSINATURA → VISTORIA → LOCAÇÃO ATIVA → COBRANÇA → SPLIT → REPASSE`

## Módulos obrigatórios

### Imóveis e anúncios
- cadastro completo do imóvel
- proprietário vinculado
- dados financeiros de locação
- endereço privado e endereço público separados
- fotos/documentos
- descrição assistida por IA
- publicação no site próprio
- distribuição para portais por adapters/feed/API conforme contrato de cada canal
- estado por canal e reconciliação

### CRM e leads
- funil configurável
- origem do lead e imóvel de interesse
- histórico/timeline
- tarefas, visitas, propostas
- captura de parâmetros de busca a partir de conversa
- deduplicação de contatos

### WhatsApp
- integração oficial servidor-servidor
- identificar imóvel por código/link/origem
- chatbot baseado apenas em dados persistidos do imóvel
- qualificar lead
- sugerir imóveis compatíveis
- agendar/solicitar visita
- handoff para humano
- chatbot lógico por imóvel, mas um único motor multi-contexto

### Vistoria
- app mobile focado em câmera e áudio
- ambientes, checklist e fotos
- gravação/transcrição de áudio
- IA transforma fala em observações estruturadas
- IA visual sugere danos/características observáveis
- vistoriador confirma/rejeita/edita
- comparação entrada x saída
- relatório PDF derivado dos dados estruturados

### Candidato e análise cadastral
- proprietário, locatário, fiador/garantidor como parties com papéis
- consentimentos e finalidade de consulta
- adapter para Serasa/SPC/outros
- regras determinísticas configuráveis de aprovação/revisão
- IA pode resumir achados, mas não decidir sozinha

### Contratos e assinatura
- templates versionados aprovados
- variáveis preenchidas pelo sistema
- geração de documento
- provider adapter de assinatura (ex.: Clicksign/D4Sign)
- webhooks idempotentes
- trilha de auditoria e hash do documento final

### Locação e financeiro
- lease/contrato ativo
- cobranças recorrentes
- Pix/Pix recorrente/Pix Automático quando suportado
- boleto
- multa, juros, desconto, taxas
- split proprietário/imobiliária
- ledger de dupla entrada
- repasse e reconciliação
- adapter financeiro (baseline: Asaas em sandbox até validação)

### Meta Ads via MCP
- conectar Business/Business Manager, conta de anúncios, Página e Instagram
- selecionar imóveis do Aluguei.app
- escolher imagens/copy, orçamento, período e parâmetros permitidos
- criar/editar/pausar/retomar anúncios
- visualizar preview e estatísticas
- respeitar Housing/Special Ad Category e restrições atuais da Meta
- MCP interno nunca recebe token bruto do LLM

## Fora do MVP

- busca visual por imóveis semelhantes
- treinamento/fine-tuning de modelo próprio
- GPU própria/Ollama/vLLM
- learning-to-rank
- marketplace entre imobiliárias
- contabilidade fiscal completa/ERP
- reconhecimento facial ou inferência de atributos pessoais protegidos
