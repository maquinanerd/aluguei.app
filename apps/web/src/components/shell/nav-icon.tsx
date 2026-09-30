/**
 * Ícones do menu lateral, desenhados como no `Painel Sidebar.dc.html` do pacote de design
 * (rodada de fidelidade, ADR-105, T8): viewBox de 16, traço de 1,4 e 15px na tela. Antes o menu
 * usava os Lucide do `packages/ui` (24 e 1,6), e faltava o `tag` de Negociações.
 */
export const NAV_ICON_PATHS = {
  layout: 'M2.5 2.5h11v11h-11zM2.5 6h11M6 6v7.5',
  users:
    'M6 7.5a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6zM1.8 13.5c.4-2.3 2.1-3.6 4.2-3.6s3.8 1.3 4.2 3.6M10.5 3a2.2 2.2 0 0 1 0 4.3M12 9.9c1.3.4 2.1 1.7 2.3 3.6',
  user: 'M8 7.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM3 13.5c.5-2.6 2.5-4 5-4s4.5 1.4 5 4',
  columns: 'M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11',
  clip: 'M5.5 2.5h5v2h-5zM4 3.5H3v10h10v-10h-1M5.5 8h5M5.5 10.5h3',
  cal: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
  home: 'M2.5 7 8 2.5 13.5 7v6.5h-11zM6.5 13.5V9.5h3v4',
  mega: 'M2.5 6.5v3h2l5 3v-9l-5 3zM12 6a2.5 2.5 0 0 1 0 4',
  share:
    'M4 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5.3 7.3l5.4-3M5.3 8.7l5.4 3',
  chat: 'M2.5 7.5a5.5 5 0 0 1 11 0 5.5 5 0 0 1-8 4.4L2.5 13l1-2.6a4.8 4.8 0 0 1-1-2.9z',
  clock:
    'M2.5 3.5h7v4M2.5 3.5v10h5M5 2v3M11.5 14.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM11.5 10.3v1.4l1 .7',
  hand: 'M2 8.5l3-3 2.5 1 2-2 4.5 4-3.5 3.5-2-1M5 5.5l3 3M7.5 11l-1.5-1.5',
  shield: 'M8 2 3 4v4c0 3 2.2 5 5 6 2.8-1 5-3 5-6V4z',
  file: 'M4 2h5.5L12 4.5V14H4zM9.5 2v2.5H12M6 8h4M6 10.5h4',
  cam: 'M2 5h3l1-1.5h4L11 5h3v8H2zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  key: 'M6 10a3 3 0 1 1 2.6-4.5L14 5.5V8h-1.5v1.5H11M5 8h.01',
  bar: 'M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5',
  receipt: 'M3.5 2h9v12l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1zM6 5.5h4M6 8h4M6 10.5h2',
  card: 'M2 4h12v8.5H2zM2 7h12M4.5 10h2',
  trend: 'M2 11.5l4-4 3 2.5 5-5.5M10.5 4.5H14V8',
  check: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM5.5 8l1.8 1.8L10.8 6.3',
  db: 'M8 5c3 0 5-.9 5-2s-2-2-5-2-5 .9-5 2 2 2 5 2zM3 3v10c0 1.1 2 2 5 2s5-.9 5-2V3M3 8c0 1.1 2 2 5 2s5-.9 5-2',
  pie: 'M8 2v6h6A6 6 0 1 1 8 2zM10 1.5A4.5 4.5 0 0 1 14.5 6H10z',
  globe:
    'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14c-1.7-1.8-2.5-3.8-2.5-6S6.3 3.8 8 2z',
  gear: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1',
  tag: 'M2.5 2.5h5l6 6-5 5-6-6zM5.5 5.5h.01',
} as const;

export type NavIconName = keyof typeof NAV_ICON_PATHS;

export function NavIcon({ name, size = 15 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={NAV_ICON_PATHS[name]} />
    </svg>
  );
}

/** Cadeado do item fora do plano, com o traço do desenho (12 × 13). */
export function CadeadoDoPlano() {
  return (
    <svg
      width="12"
      height="13"
      viewBox="0 0 12 13"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1.5"
        y="5.5"
        width="9"
        height="6.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth={1.3}
      />
      <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" stroke="currentColor" strokeWidth={1.3} />
    </svg>
  );
}
