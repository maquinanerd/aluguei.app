export interface RedFlag {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  detail?: string;
}

export interface ScreeningProviderResult {
  score: number | null;
  redFlags: RedFlag[];
  summary: Record<string, unknown>;
}

export interface CreditScreeningInput {
  cpf: string;
  purpose: string;
}

/** Provider de screening de crédito — Serasa/SPC reais sem credencial ficam registrados sem adapter. */
export interface IScreeningProvider {
  requestCreditScreening(input: CreditScreeningInput): Promise<ScreeningProviderResult>;
}
