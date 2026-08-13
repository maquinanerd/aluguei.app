# Modelo de domínio

## Entidades principais

### Organização e identidade
- Organization
- User
- Membership
- Role/Permission
- AuditEvent

### Pessoas/partes
- Party
- PartyRole: OWNER | TENANT | GUARANTOR | BROKER | LEGAL_REPRESENTATIVE
- PartyIdentity
- PartyAddress
- PartyDocument
- PartyBankAccount
- PartyConsent

### Imóvel
- Property
- PropertyAddress
- PropertyFinancialTerms
- PropertyMedia
- PropertyFeature
- PropertyOwner
- Listing
- ListingChannelPublication

### CRM
- Lead
- LeadPropertyInterest
- Conversation
- Message
- Opportunity
- Visit
- Proposal
- Task
- TimelineEvent

### Vistoria
- Inspection
- InspectionRoom
- InspectionMedia
- InspectionAudio
- InspectionTranscript
- InspectionObservation
- InspectionAiSuggestion
- InspectionComparison
- InspectionReport

### Locação
- RentalApplication
- ScreeningRequest
- ScreeningResult
- ApplicationDecision
- Guarantee
- Lease

### Documentos
- ContractTemplate
- ContractTemplateVersion
- Contract
- ContractParty
- SignatureEnvelope
- SignatureEvent
- StoredDocument

### Financeiro
- Charge
- Payment
- PaymentAttempt
- SplitRule
- SplitAllocation
- Payout
- Refund
- LedgerAccount
- LedgerEntry
- Reconciliation

### Integração Meta
- MetaConnection
- MetaAsset
- MetaAdProfile
- MetaCampaignLink
- MetaAdSetLink
- MetaCreativeLink
- MetaAdLink
- MetaInsightSnapshot
- MetaSyncJob

## Máquinas de estado essenciais

### Listing
`DRAFT → READY → PUBLISHED → PAUSED → ARCHIVED`

Estados por canal são independentes do listing principal.

### Lead/Opportunity
`NEW → QUALIFYING → QUALIFIED → VISIT → PROPOSAL → APPLICATION → WON | LOST`

### RentalApplication
`DRAFT → SUBMITTED → SCREENING → MANUAL_REVIEW | APPROVED | REJECTED → CONTRACTING`

### Contract
`DRAFT → GENERATED → SENT_FOR_SIGNATURE → PARTIALLY_SIGNED → SIGNED | VOID`

### Inspection
`DRAFT → CAPTURING → PROCESSING → REVIEW → COMPLETED → SIGNED`

### Lease
`PENDING → ACTIVE → DELINQUENT → TERMINATING → ENDED`

### Charge
`SCHEDULED → OPEN → PAID | OVERDUE | CANCELLED | REFUNDED`

### Meta campaign local
`DRAFT → PREPARED → CREATED_PAUSED → ACTIVE → PAUSED → ARCHIVED | ERROR`

## Regras invariantes

- um registro de fornecedor nunca é a identidade primária da entidade local
- status externo não substitui status local sem reconciliação
- conta bancária e split têm versionamento/auditoria
- pagamentos usam centavos inteiros
- observação de IA nunca substitui confirmação humana em vistoria crítica
- endereço privado não é automaticamente endereço público do anúncio
