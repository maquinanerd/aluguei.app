import { z } from 'zod';
import { DomainError } from '@aluguei/domain';
import type { CreditScreeningInput, IScreeningProvider, ScreeningProviderResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Escore Serasa: faixa pública documentada 0–1000 (int).
 * "Pontuação de 0 a 1.000 ... quanto mais próximo de 1.000, menor a chance de inadimplência."
 * Fonte: serasaexperian.com.br/solucoes/score-e-atributos-api/ (acessado em 2026-08-17).
 */
const serasaScoreSchema = z.number().int().min(0).max(1000);

/**
 * Formato de resposta esperado do produto "Score e Atributos via API" (Pessoa Física).
 *
 * A documentação pública confirma apenas a faixa 0–1000. O NOME do campo e o
 * restante do JSON vêm do LAYOUT do produto contratado — alinhar este schema
 * com o layout durante a homologação antes de habilitar em produção.
 */
export const serasaScoreResponseSchema = z.object({
  score: serasaScoreSchema,
});

/**
 * Mapeia o payload bruto do Serasa para o formato do domínio (IScreeningResult).
 * Red flags (negativações PEFIN/CCF/protesto) devem ser mapeadas aqui a partir
 * dos campos do layout contratado quando o adapter for completado.
 */
export function mapSerasaScoreResponse(payload: unknown): ScreeningProviderResult {
  const parsed = serasaScoreResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new DomainError(
      'PROVIDER_ERROR',
      'Serasa: resposta de score fora do formato esperado (0–1000)',
      {
        issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      },
    );
  }
  return {
    score: parsed.data.score,
    redFlags: [],
    summary: { provider: 'serasa', score: parsed.data.score },
  };
}

export interface SerasaScreeningProviderOptions {
  /** Credencial de aplicação (IAM). Fornecida no contrato. */
  clientId: string;
  clientSecret: string;
  /** Endpoint do produto contratado (layout) — não confirmado publicamente. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Adapter Serasa Score — ESQUELETO (BLOCKED_PROVIDER_CONTRACT).
 *
 * A documentação pública confirma o produto ("Score e Atributos via API",
 * score PF 0–1000, autenticação IAM, HTTPS/TLS 1.2+), mas endpoint, layout de
 * chamada/retorno e detalhes de autenticação só existem no layout do produto
 * CONTRATADO. Sem contrato não é possível construir uma chamada real — por isso
 * `requestCreditScreening` lança DomainError tipado com instruções e NUNCA
 * chama a rede (nenhum endpoint é inventado).
 *
 * Ao obter o contrato + layout: implementar auth IAM, POST HTTPS, timeout/retry,
 * parse via `serasaScoreResponseSchema` (alinhado ao layout) e reclassificar
 * para IMPLEMENTED_NOT_LIVE_VERIFIED após homologação no sandbox.
 */
export class SerasaScreeningProvider implements IScreeningProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string | undefined;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly timeoutMs: number;

  constructor(opts: SerasaScreeningProviderOptions) {
    if (!opts.clientId || !opts.clientSecret) {
      throw new DomainError(
        'INVALID_INPUT',
        'Serasa: clientId e clientSecret são obrigatórios (credenciais IAM fornecidas no contrato)',
      );
    }
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.baseUrl = opts.baseUrl;
    this.fetchImpl = opts.fetchImpl;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new DomainError('INVALID_INPUT', 'Serasa: timeoutMs deve ser positivo');
    }
  }

  requestCreditScreening(_input: CreditScreeningInput): Promise<ScreeningProviderResult> {
    return Promise.reject(this.notDocumentedError());
  }

  /** Erro tipado "provider não documentado/sem contrato" com instruções de desbloqueio. */
  private notDocumentedError(): DomainError {
    const instructions = [
      'Produto publico confirmado: "Score e Atributos via API" (Serasa Score PF 0-1000, autenticacao IAM, HTTPS/TLS 1.2+).',
      'Endpoint, layout de chamada/retorno, scopes/transacoes e erros NAO sao publicos: constam no layout do produto contratado.',
      'Solicite contrato + layout do produto + credenciais IAM + logon de homologacao (validade 90 dias, troca em www.serasaexperian.com.br/homologa) ao representante comercial ou Central de Atendimento (11) 3003-7372.',
      'Com o layout em maos, complete requestCreditScreening (auth IAM + POST HTTPS + parse via serasaScoreResponseSchema) e reclassifique o adapter para IMPLEMENTED_NOT_LIVE_VERIFIED.',
    ].join(' ');
    return new DomainError(
      'PROVIDER_ERROR',
      'Serasa: provider não documentado/sem contrato — sem layout e endpoint oficiais a consulta não pode ser implementada',
      {
        instructions,
        needs: ['contrato_comercial', 'layout_produto', 'credenciais_iam', 'logon_homologacao'],
        configured: {
          baseUrlProvided: this.baseUrl !== undefined,
          fetchProvided: this.fetchImpl !== undefined,
          timeoutMs: this.timeoutMs,
        },
        classification: 'BLOCKED_PROVIDER_CONTRACT',
      },
    );
  }
}
