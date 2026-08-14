function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export interface BotPropertyData {
  title: string;
  code: string;
  monthlyRentCents: number | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  furnished: boolean;
  petsAllowed: boolean | null;
}

/** Compõe respostas PT-BR APENAS com dados persistidos. Nunca inventa preço/disponibilidade. */
export function buildPropertyReply(property: BotPropertyData): string {
  const lines: string[] = [`*${property.title}* (${property.code})`];
  const rent = property.monthlyRentCents !== null ? formatBRL(property.monthlyRentCents) : null;
  lines.push(rent ? `Aluguel: *${rent}/mês*` : 'Aluguel: consulte nossa equipe');
  const address = [property.neighborhood, property.city, property.state].filter(Boolean).join(', ');
  if (address) {
    lines.push(`Localização: ${address}`);
  }
  const specs: string[] = [];
  if (property.bedrooms !== null) specs.push(`${String(property.bedrooms)} quartos`);
  if (property.bathrooms !== null) specs.push(`${String(property.bathrooms)} banheiros`);
  if (property.parkingSpots !== null) specs.push(`${String(property.parkingSpots)} vagas`);
  if (property.furnished) specs.push('mobiliado');
  if (property.petsAllowed !== null)
    specs.push(property.petsAllowed ? 'aceita pets' : 'não aceita pets');
  if (specs.length > 0) {
    lines.push(`Características: ${specs.join(' · ')}`);
  }
  lines.push('Para agendar uma visita, me diga o melhor dia e horário!');
  return lines.join('\n');
}

export function buildPropertyNotFoundReply(code: string): string {
  return `Não encontrei o imóvel *${code}* aqui. Confira o código ou me diga o que procura (bairro, faixa de aluguel, quartos).`;
}

export function buildVisitScheduleRequest(): string {
  return 'Perfeito! Qual dia e horário funcionam melhor para a visita?';
}

export function buildHandoffReply(): string {
  return 'Um atendente humano vai te atender em instantes. 🧑‍💼';
}

export function buildFallbackReply(): string {
  return 'Entendi! Conte mais sobre o que procura (bairro, faixa de aluguel, número de quartos) para eu sugerir imóveis compatíveis.';
}
