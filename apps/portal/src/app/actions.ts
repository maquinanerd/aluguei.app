'use server';

import { z } from 'zod';
import { PortalApiError, criarAlerta, enviarContato, responderAlerta } from '@/lib/api';

/**
 * Ações de escrita do portal. Rodam no servidor: o navegador nunca fala com a
 * API direto, e o consentimento LGPD é conferido aqui antes de sair daqui.
 */

export interface EstadoDoFormulario {
  estado: 'inicial' | 'enviado' | 'erro' | 'limite';
  mensagem?: string;
  campo?: string;
}

const contatoSchema = z
  .object({
    nome: z.string().trim().min(2, 'Diga seu nome').max(120),
    telefone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((valor) => (valor === undefined || valor === '' ? undefined : valor)),
    email: z
      .string()
      .trim()
      .max(160)
      .optional()
      .transform((valor) => (valor === undefined || valor === '' ? undefined : valor)),
    mensagem: z.string().trim().max(800).optional(),
    consentimento: z.literal('on', { message: 'Precisa autorizar para enviar o contato' }),
  })
  .refine((entrada) => entrada.telefone !== undefined || entrada.email !== undefined, {
    message: 'Informe telefone ou e-mail para a imobiliária responder',
    path: ['telefone'],
  });

export async function enviarContatoAction(
  slug: string,
  _anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const entrada = contatoSchema.safeParse({
    nome: dados.get('nome'),
    telefone: dados.get('telefone') ?? undefined,
    email: dados.get('email') ?? undefined,
    mensagem: dados.get('mensagem') ?? undefined,
    consentimento: dados.get('consentimento') ?? '',
  });
  if (!entrada.success) {
    const primeiro = entrada.error.issues[0];
    const campo = primeiro?.path[0];
    return {
      estado: 'erro',
      mensagem: primeiro?.message ?? 'Confira os campos',
      ...(campo === undefined ? {} : { campo: String(campo) }),
    };
  }

  try {
    await enviarContato(slug, {
      name: entrada.data.nome,
      ...(entrada.data.telefone === undefined ? {} : { phone: entrada.data.telefone }),
      ...(entrada.data.email === undefined ? {} : { email: entrada.data.email }),
      ...(entrada.data.mensagem === undefined ? {} : { message: entrada.data.mensagem }),
      consent: true,
    });
    return { estado: 'enviado' };
  } catch (erro) {
    if (erro instanceof PortalApiError && erro.status === 429) {
      return {
        estado: 'limite',
        mensagem: 'Muitos envios seguidos. Espere um minuto e tente de novo.',
      };
    }
    return {
      estado: 'erro',
      mensagem: 'Não deu para enviar agora. Tente de novo em instantes.',
    };
  }
}

const alertaSchema = z
  .object({
    purpose: z.enum(['RENT', 'SALE']),
    city: z.string().regex(/^[a-z0-9-]+$/),
    neighborhood: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    propertyType: z.string().optional(),
    bedrooms: z.coerce.number().int().min(1).max(6).optional(),
    contato: z.string().trim().min(8, 'Informe um e-mail').max(120),
    // Só e-mail: não existe envio por WhatsApp, e o alerta pedido por lá nunca confirmava
    // (Onda 0 da rodada de fidelidade, defeito 9).
    canal: z.enum(['EMAIL'], { message: 'Por enquanto o aviso é só por e-mail' }),
    consentimento: z.literal('on', { message: 'Precisa autorizar para criar o alerta' }),
  })
  .refine((entrada) => z.email().safeParse(entrada.contato).success, {
    message: 'E-mail inválido',
    path: ['contato'],
  });

export async function criarAlertaAction(
  _anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const entrada = alertaSchema.safeParse({
    purpose: dados.get('purpose'),
    city: dados.get('city'),
    neighborhood: dados.get('neighborhood') ?? undefined,
    propertyType: dados.get('propertyType') ?? undefined,
    bedrooms: dados.get('bedrooms') ?? undefined,
    contato: dados.get('contato'),
    canal: dados.get('canal'),
    consentimento: dados.get('consentimento') ?? '',
  });
  if (!entrada.success) {
    const primeiro = entrada.error.issues[0];
    const campo = primeiro?.path[0];
    return {
      estado: 'erro',
      mensagem: primeiro?.message ?? 'Confira os campos',
      ...(campo === undefined ? {} : { campo: String(campo) }),
    };
  }

  try {
    await criarAlerta({
      purpose: entrada.data.purpose,
      city: entrada.data.city,
      ...(entrada.data.neighborhood === undefined
        ? {}
        : { neighborhood: entrada.data.neighborhood }),
      ...(entrada.data.propertyType === undefined
        ? {}
        : { propertyType: entrada.data.propertyType }),
      ...(entrada.data.bedrooms === undefined ? {} : { bedrooms: entrada.data.bedrooms }),
      contactKind: entrada.data.canal,
      contactValue: entrada.data.contato,
      consent: true,
    });
    return {
      estado: 'enviado',
      mensagem: 'Falta um passo: confirme pelo link que enviamos para o seu e-mail.',
    };
  } catch (erro) {
    if (erro instanceof PortalApiError && erro.status === 429) {
      return { estado: 'limite', mensagem: 'Muitos pedidos seguidos. Espere um minuto.' };
    }
    return { estado: 'erro', mensagem: 'Não deu para criar o alerta agora.' };
  }
}

/**
 * Cancela o alerta pelo token do link — só quando a pessoa aperta o botão. Abrir o link apenas
 * pergunta: leitor de e-mail que pré-abre links cancelava alerta sozinho quando o cancelamento
 * acontecia no GET da página (Onda 0 da rodada de fidelidade, defeito 8).
 */
export async function cancelarAlertaAction(
  _anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const token = dados.get('token');
  if (typeof token !== 'string' || token.trim() === '') {
    return { estado: 'erro', mensagem: 'O link está incompleto.' };
  }
  try {
    await responderAlerta('cancel', token);
    return { estado: 'enviado' };
  } catch {
    return { estado: 'erro', mensagem: 'O link já foi usado ou não vale mais.' };
  }
}
