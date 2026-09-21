import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Camadas do design system (G3, trilha D): o diálogo aberto a partir de um drawer (cancelar uma
 * visita, recusar uma proposta) precisa ficar por cima dele, e o toast por cima de tudo — a mesma
 * ordem do design system de referência (Kal El: drawer 44–46, modal 50, toast 60). Antes o drawer
 * (140) cobria o modal (130), e o modal cobria o toast (120).
 */
function zToken(name: string): number {
  const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
  const match = new RegExp(`--peg-z-${name}:\\s*(\\d+);`).exec(css);
  if (!match?.[1]) {
    throw new Error(`token --peg-z-${name} ausente`);
  }
  return Number(match[1]);
}

describe('ordem das camadas', () => {
  it('dropdown < tooltip < drawer < modal < toast', () => {
    const order = ['dropdown', 'tooltip', 'drawer', 'modal', 'toast'].map(zToken);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });
});
