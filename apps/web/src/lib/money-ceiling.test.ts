import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_CENTS } from '@aluguei/contracts';
import { MONEY_INPUT_MAX_CENTS, parseMoneyInput } from '@aluguei/ui';

/**
 * O campo de dinheiro do painel recusa o que a API recusaria (teto dos centavos, pendência da
 * trilha G do G3): o usuário vê o erro no campo, não um 400 depois de enviar.
 */
describe('teto do campo de dinheiro igual ao da API', () => {
  it('mesmo teto', () => {
    expect(MONEY_INPUT_MAX_CENTS).toBe(MAX_AMOUNT_CENTS);
  });

  it('R$ 1.000.000,00 aceito; um centavo a mais, recusado', () => {
    expect(parseMoneyInput('1.000.000,00')).toMatchObject({ ok: true, cents: 100_000_000 });
    expect(parseMoneyInput('1.000.000,01')).toMatchObject({ ok: false, code: 'TOO_LARGE' });
  });
});
