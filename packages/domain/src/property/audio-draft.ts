/**
 * Cadastro por áudio: redação de PII e extração de campos da transcrição (ADR-104).
 *
 * Duas responsabilidades, nesta ordem:
 *
 * 1. **Redigir.** CPF, telefone e e-mail saem da transcrição antes de ela ser
 *    guardada e antes de qualquer chamada de extração. Nenhum deles é campo de
 *    ficha de imóvel: mandá-los seria enviar PII que a tarefa não usa.
 * 2. **Extrair por regra.** O que dá para reconhecer com regra vira campo; o
 *    resto fica faltando. Uma regra que erra devagar é melhor que um palpite que
 *    erra rápido, porque a pessoa confere campo a campo antes de virar imóvel.
 *
 * O hedge do corretor ("acho que", "mais ou menos", "uns") não é ruído: é a
 * diferença entre um valor que dá para usar e um que precisa de confirmação, e
 * é o que separa `FROM_AUDIO` de `NEEDS_CONFIRMATION`.
 */

export type AudioDraftFieldKey =
  | 'TITLE'
  | 'PROPERTY_TYPE'
  | 'PURPOSE'
  | 'TOTAL_AREA_SQM'
  | 'BEDROOMS'
  | 'BATHROOMS'
  | 'PARKING_SPOTS'
  | 'FURNISHED'
  | 'PETS_ALLOWED'
  | 'MONTHLY_RENT_CENTS'
  | 'SALE_PRICE_CENTS'
  | 'CONDO_FEE_CENTS'
  | 'IPTU_CENTS'
  | 'STREET'
  | 'NUMBER'
  | 'COMPLEMENT'
  | 'NEIGHBORHOOD'
  | 'CITY'
  | 'STATE'
  | 'ZIP_CODE';

export type AudioDraftFieldState = 'FROM_AUDIO' | 'NEEDS_CONFIRMATION' | 'MISSING' | 'EDITED';

export interface AudioDraftField {
  key: AudioDraftFieldKey;
  value: string | null;
  state: AudioDraftFieldState;
  /** Trecho do áudio que originou o valor; a tela liga campo e transcrição. */
  evidence: string | null;
}

/** Marcador visível: quem lê a transcrição precisa saber que algo foi retirado. */
export const REDACTED = '[removido]';

const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const TELEFONE = /(?:\+55\s?)?\(?\b\d{2}\)?\s?9?\s?\d{4}[-\s]?\d{4}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

/**
 * Tira da transcrição o que não é campo de imóvel. Roda antes de guardar e
 * antes de qualquer chamada de extração — não depois: depois já saiu.
 */
export function redactPersonalData(text: string): string {
  return text.replace(EMAIL, REDACTED).replace(CPF, REDACTED).replace(TELEFONE, REDACTED);
}

const UNIDADES: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
};

/** `Á` vira `a`: o corretor fala, o transcritor acentua, a regra não deve depender disso. */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Número por extenso em pt-BR até a casa dos milhares ("dois mil e trezentos").
 * Devolve `null` quando não reconhece — chute em valor de aluguel é o pior tipo
 * de chute, porque parece certo na tela.
 */
export function numeroPorExtenso(texto: string): number | null {
  const palavras = semAcento(texto)
    .split(/[\s-]+/)
    .filter((palavra) => palavra !== '' && palavra !== 'e');
  if (palavras.length === 0) {
    return null;
  }
  let total = 0;
  let parcial = 0;
  let reconheceu = false;
  for (const palavra of palavras) {
    if (palavra === 'mil') {
      total += (parcial === 0 ? 1 : parcial) * 1000;
      parcial = 0;
      reconheceu = true;
      continue;
    }
    const valor = UNIDADES[palavra];
    if (valor === undefined) {
      return null;
    }
    parcial += valor;
    reconheceu = true;
  }
  return reconheceu ? total + parcial : null;
}

const HEDGES = [
  'acho que',
  'acredito que',
  'mais ou menos',
  'por volta de',
  'em torno de',
  'deve dar',
  'da uns',
  'uns',
  'umas',
  'aproximadamente',
  'se nao me engano',
  'talvez',
];

/** Hesitação perto do trecho: o valor entra como "confirmar", não como certo. */
export function temHesitacao(contexto: string): boolean {
  const limpo = semAcento(contexto);
  return HEDGES.some((hedge) => limpo.includes(hedge));
}

/**
 * Tira as expressões de hesitação de dentro do valor. "quatrocentos e oitenta
 * mais ou menos" é quatrocentos e oitenta dito com dúvida — a dúvida vira
 * estado do campo, não motivo para perder o número.
 */
export function limparHedge(trecho: string): string {
  let limpo = semAcento(trecho);
  for (const hedge of HEDGES) {
    limpo = limpo.split(hedge).join(' ');
  }
  return limpo.replace(/\s+/g, ' ').trim();
}

/** `1.150`, `2300`, `72` — e também `dois mil e trezentos`. */
export function numeroDoTrecho(trecho: string): number | null {
  const digitos = /(\d[\d.]*)(?:,(\d{1,2}))?/.exec(trecho);
  if (digitos) {
    const inteiro = Number((digitos[1] ?? '').replace(/\./g, ''));
    if (Number.isFinite(inteiro)) {
      return inteiro;
    }
  }
  return numeroPorExtenso(limparHedge(trecho));
}

interface Achado {
  value: string;
  evidence: string;
  hesitou: boolean;
}

/**
 * Contexto do trecho **na mesma oração**. Olhar 40 caracteres para trás sem
 * respeitar a pontuação faz o "acho que" de uma frase contaminar a seguinte, e
 * aí tudo depois de uma hesitação vira "confirmar" — o oposto de informar.
 */
function oracaoAnterior(texto: string, ate: number): string {
  const janela = texto.slice(Math.max(0, ate - 60), ate);
  const corte = Math.max(
    janela.lastIndexOf('.'),
    janela.lastIndexOf(','),
    janela.lastIndexOf(';'),
    janela.lastIndexOf('?'),
    janela.lastIndexOf('!'),
  );
  return corte === -1 ? janela : janela.slice(corte + 1);
}

/**
 * Procura no texto **normalizado** (sem acento, minúsculo) e devolve a evidência
 * recortada do texto **original**. As regras não deviam depender de o
 * transcritor ter acentuado "Goiânia", mas quem revisa precisa ler o que foi
 * dito, com acento e maiúscula — os índices batem porque tirar o acento não
 * muda o comprimento.
 */
function acharPor(
  normalizado: string,
  original: string,
  regex: RegExp,
  extrair: (m: RegExpExecArray, doOriginal: (grupo: number) => string) => string | null,
): Achado | null {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const busca = new RegExp(regex.source, flags.includes('d') ? flags : `${flags}d`);
  let m: RegExpExecArray | null;
  while ((m = busca.exec(normalizado)) !== null) {
    const achadoAtual = m;
    const doOriginal = (grupo: number): string => {
      const faixa = achadoAtual.indices?.[grupo];
      return faixa ? original.slice(faixa[0], faixa[1]) : (achadoAtual[grupo] ?? '');
    };
    const valor = extrair(m, doOriginal);
    if (valor === null) {
      continue;
    }
    const antes = oracaoAnterior(normalizado, m.index);
    const fim = m.index + m[0].length;
    return {
      value: valor,
      evidence: original.slice(Math.max(0, m.index - antes.length), fim).trim(),
      hesitou: temHesitacao(`${antes}${m[0]}`),
    };
  }
  return null;
}

/** `setor bueno` → `Setor Bueno`: o campo é lido por gente. */
function comoNomeProprio(texto: string): string {
  return texto
    .trim()
    .split(/\s+/)
    .map((palavra) =>
      palavra.length <= 2
        ? palavra
        : `${(palavra[0] ?? '').toUpperCase()}${palavra.slice(1).toLowerCase()}`,
    )
    .join(' ');
}

const TIPOS: Array<[RegExp, string]> = [
  [/\bapartamento\b|\bapto\b|\bap\b/, 'APARTMENT'],
  [/\bcasa\b/, 'HOUSE'],
  [/\bkitnet\b|\bkitinete\b|\bstudio\b/, 'STUDIO'],
  [/\bsala comercial\b|\bloja\b|\bponto comercial\b/, 'COMMERCIAL'],
  [/\bterreno\b|\blote\b/, 'LAND'],
];

/**
 * O valor vai até a pontuação. Captura preguiçosa parava em "dois" e
 * transformava "dois mil e trezentos" em R$ 2,00 — erro que passa despercebido
 * porque o campo fica preenchido.
 */
const VALOR = String.raw`(?:r\$\s*)?([\d.]+|[a-z\s]+?)(?=\s*[,.;!?]|\s*$)`;

/**
 * Lê a transcrição e devolve um campo por chave: preenchido quando a regra
 * reconheceu, `MISSING` quando não. Toda chave aparece — a tela precisa mostrar
 * o que falta, não só o que veio.
 */
export function extractPropertyDraftFromTranscript(
  transcriptOriginal: string,
  chaves: readonly AudioDraftFieldKey[],
): AudioDraftField[] {
  // Redigir primeiro, sempre: o que sai daqui já não tem CPF, telefone nem
  // e-mail — nem na busca, nem na evidência guardada.
  const original = redactPersonalData(transcriptOriginal);
  const texto = semAcento(original);
  const achados = new Map<AudioDraftFieldKey, Achado>();

  const guardar = (chave: AudioDraftFieldKey, achado: Achado | null): void => {
    if (achado !== null && achado.value !== '') {
      achados.set(chave, achado);
    }
  };

  for (const [regex, tipo] of TIPOS) {
    const achado = acharPor(texto, original, regex, () => tipo);
    if (achado) {
      achados.set('PROPERTY_TYPE', achado);
      break;
    }
  }

  guardar(
    'PURPOSE',
    acharPor(texto, original, /\b(alugar|aluguel|locacao|vender|venda)\b/, (m) =>
      (m[1] ?? '').startsWith('v') ? 'SALE' : 'RENT',
    ),
  );

  guardar(
    'BEDROOMS',
    acharPor(texto, original, /([\wçã]+)\s+quartos?\b/, (m) => {
      const n = numeroDoTrecho(m[1] ?? '');
      return n === null ? null : String(n);
    }),
  );
  guardar(
    'BATHROOMS',
    acharPor(texto, original, /([\wçã]+)\s+banheiros?\b/, (m) => {
      const n = numeroDoTrecho(m[1] ?? '');
      return n === null ? null : String(n);
    }),
  );
  guardar(
    'PARKING_SPOTS',
    acharPor(texto, original, /([\wçã]+)\s+vagas?\b/, (m) => {
      const n = numeroDoTrecho(m[1] ?? '');
      return n === null ? null : String(n);
    }),
  );
  guardar(
    'TOTAL_AREA_SQM',
    acharPor(texto, original, /([\wçã\s]{1,30}?)\s*(?:m2|m²|metros quadrados|metros)\b/, (m) => {
      const n = numeroDoTrecho(m[1] ?? '');
      return n === null || n === 0 ? null : String(n);
    }),
  );

  guardar(
    'MONTHLY_RENT_CENTS',
    acharPor(texto, original, new RegExp(String.raw`alugue?l?\s*(?:e|de|:)?\s*${VALOR}\b`), (m) => {
      const n = numeroDoTrecho(m[1] ?? '');
      return n === null || n === 0 ? null : String(n * 100);
    }),
  );
  guardar(
    'SALE_PRICE_CENTS',
    acharPor(
      texto,
      original,
      new RegExp(String.raw`(?:pre[cç]o|valor|pedindo)\s*(?:de|:)?\s*${VALOR}\b`),
      (m) => {
        const n = numeroDoTrecho(m[1] ?? '');
        return n === null || n === 0 ? null : String(n * 100);
      },
    ),
  );
  guardar(
    'CONDO_FEE_CENTS',
    acharPor(
      texto,
      original,
      new RegExp(String.raw`condominio\s*(?:e|de|:)?\s*${VALOR}\b`),
      (m) => {
        const n = numeroDoTrecho(m[1] ?? '');
        return n === null || n === 0 ? null : String(n * 100);
      },
    ),
  );
  guardar(
    'IPTU_CENTS',
    acharPor(texto, original, new RegExp(String.raw`iptu\s*(?:e|de|da|:)?\s*${VALOR}\b`), (m) => {
      const n = numeroDoTrecho(m[1] ?? '');
      return n === null || n === 0 ? null : String(n * 100);
    }),
  );

  guardar(
    'PETS_ALLOWED',
    acharPor(texto, original, /\b(nao aceita pet|aceita pet|permite pet)\b/, (m) =>
      (m[1] ?? '').startsWith('nao') ? 'false' : 'true',
    ),
  );
  guardar(
    'FURNISHED',
    acharPor(texto, original, /\b(nao e mobiliado|sem mobilia|mobiliado|semimobiliado)\b/, (m) => {
      const achado = m[1] ?? '';
      return achado === 'mobiliado' ? 'true' : 'false';
    }),
  );

  // Endereço: o que dá para reconhecer sem inventar. Bairro e cidade guiam a
  // vitrine; rua e número ficam no cadastro privado.
  guardar(
    'NEIGHBORHOOD',
    // "Setor Bueno" é o nome do bairro, com "Setor" dentro; "bairro Centro" é o
    // Centro. Tratar as duas palavras como a mesma marca cortaria metade do nome.
    acharPor(
      texto,
      original,
      /\b(bairro|setor)\s+([a-zà-ü]+(?:\s+[a-zà-ü]+)?)/,
      (m, doOriginal) => {
        const marca = m[1] ?? '';
        // O nome sai do original: "Jardim Goiás" não é "Jardim Goias".
        const nome = doOriginal(2).trim();
        if (nome === '') {
          return null;
        }
        return comoNomeProprio(marca === 'setor' ? `setor ${nome}` : nome);
      },
    ),
  );
  guardar(
    'ZIP_CODE',
    acharPor(texto, original, /\b(\d{5}-?\d{3})\b/, (m) =>
      (m[1] ?? '').replace(/(\d{5})-?(\d{3})/, '$1-$2'),
    ),
  );

  return chaves.map((key) => {
    const achado = achados.get(key);
    if (!achado) {
      return { key, value: null, state: 'MISSING' as const, evidence: null };
    }
    return {
      key,
      value: achado.value,
      state: achado.hesitou ? ('NEEDS_CONFIRMATION' as const) : ('FROM_AUDIO' as const),
      evidence: achado.evidence,
    };
  });
}
