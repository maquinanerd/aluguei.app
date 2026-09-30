import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ações do portal que a Onda 0 da rodada de fidelidade corrigiu:
 * - defeito 8: cancelar o alerta passou a ser ação do botão, não efeito de abrir o link;
 * - defeito 9: o alerta por WhatsApp prometia envio e nada era enfileirado. Até existir canal,
 *   a ação recusa WhatsApp em vez de criar um alerta que nunca confirma.
 */

const api = vi.hoisted(() => ({
  responderAlerta: vi.fn(),
  criarAlerta: vi.fn(),
  enviarContato: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  ...api,
  PortalApiError: class PortalApiError extends Error {
    constructor(
      readonly status: number,
      mensagem: string,
    ) {
      super(mensagem);
    }
  },
}));

import { cancelarAlertaAction, criarAlertaAction } from './actions';

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cancelarAlertaAction', () => {
  it('cancela pelo token do formulário', async () => {
    api.responderAlerta.mockResolvedValue({ status: 'CANCELLED' });
    const estado = await cancelarAlertaAction(
      { estado: 'inicial' },
      formulario({ token: 'tok-1' }),
    );
    expect(api.responderAlerta).toHaveBeenCalledWith('cancel', 'tok-1');
    expect(estado.estado).toBe('enviado');
  });

  it('link já usado ou inválido vira erro, sem fingir que cancelou', async () => {
    api.responderAlerta.mockRejectedValue(new Error('API respondeu 404'));
    const estado = await cancelarAlertaAction({ estado: 'inicial' }, formulario({ token: 'x' }));
    expect(estado.estado).toBe('erro');
  });

  it('sem token não chama a API', async () => {
    const estado = await cancelarAlertaAction({ estado: 'inicial' }, formulario({}));
    expect(api.responderAlerta).not.toHaveBeenCalled();
    expect(estado.estado).toBe('erro');
  });
});

describe('criarAlertaAction', () => {
  it('recusa o canal WhatsApp sem chamar a API: não há envio por WhatsApp', async () => {
    const estado = await criarAlertaAction(
      { estado: 'inicial' },
      formulario({
        purpose: 'RENT',
        city: 'goiania-go',
        contato: '(62) 98812-5678',
        canal: 'WHATSAPP',
        consentimento: 'on',
      }),
    );
    expect(api.criarAlerta).not.toHaveBeenCalled();
    expect(estado.estado).toBe('erro');
  });

  it('sem a autorização não chama a API e diz o que falta, como no modal da tela', async () => {
    const estado = await criarAlertaAction(
      { estado: 'inicial' },
      formulario({
        purpose: 'RENT',
        city: 'goiania-go',
        contato: 'ana@exemplo.test',
        canal: 'EMAIL',
      }),
    );
    expect(api.criarAlerta).not.toHaveBeenCalled();
    expect(estado).toMatchObject({
      estado: 'erro',
      mensagem: 'Erro: marque a autorização para criar o alerta.',
    });
  });

  it('criado, não diz que enviou e-mail: nada sai por e-mail ainda (defeito 18)', async () => {
    api.criarAlerta.mockResolvedValue(undefined);
    const estado = await criarAlertaAction(
      { estado: 'inicial' },
      formulario({
        purpose: 'RENT',
        city: 'goiania-go',
        contato: 'ana@exemplo.test',
        canal: 'EMAIL',
        consentimento: 'on',
      }),
    );
    expect(estado.estado).toBe('enviado');
    expect(estado.mensagem).toContain('Registramos o alerta');
    expect(estado.mensagem).not.toMatch(/enviamos|mandamos|você recebe/i);
  });
});
