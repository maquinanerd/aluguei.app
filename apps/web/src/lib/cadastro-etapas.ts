/**
 * Regras do cadastro em etapas (Onda 3), fora do componente para poderem ser
 * testadas. São as mesmas do contrato da API (`registerRequestSchema`): a
 * validação por etapa existe para o erro aparecer na pergunta onde ele nasceu,
 * não para substituir a do servidor.
 */

export const TOTAL_ETAPAS = 6;

export interface DadosDoCadastro {
  name: string;
  email: string;
  organizationName: string;
  document: string;
  phone: string;
  creci: string;
  requestedPlanCode: string;
  password: string;
}

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Erro da etapa, ou `null` quando ela pode avançar. */
export function erroDaEtapa(etapa: number, dados: DadosDoCadastro): string | null {
  if (etapa === 1 && dados.name.trim() === '') {
    return 'Informe seu nome.';
  }
  if (etapa === 2 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email.trim())) {
    return 'Informe um e-mail válido.';
  }
  if (etapa === 3) {
    if (dados.organizationName.trim() === '') {
      return 'Informe o nome da imobiliária.';
    }
    const digitos = apenasDigitos(dados.document);
    if (digitos !== '' && digitos.length !== 11 && digitos.length !== 14) {
      return 'CPF tem 11 dígitos e CNPJ tem 14.';
    }
  }
  if (etapa === 4) {
    const digitos = apenasDigitos(dados.phone);
    if (digitos !== '' && (digitos.length < 10 || digitos.length > 13)) {
      return 'Telefone com DDD.';
    }
  }
  // A etapa 5 (plano) não trava: quem não escolhe combina na análise.
  if (etapa === 6 && dados.password.length < 8) {
    return 'A senha precisa de pelo menos 8 caracteres.';
  }
  return null;
}

/**
 * Plano pré-selecionado a partir do `?plano=` do portal. Código que a API não
 * conhece (plano desligado, link velho, URL montada à mão) **não** é
 * pré-selecionado: a etapa 5 pergunta de novo, em vez de a tela afirmar um plano
 * que não existe.
 */
export function planoInicialValido(
  codigosDisponiveis: readonly string[],
  pedido: string | null,
): string | null {
  if (pedido === null || pedido === '') {
    return null;
  }
  return codigosDisponiveis.includes(pedido) ? pedido : null;
}
