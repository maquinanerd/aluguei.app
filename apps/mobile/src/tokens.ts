/**
 * Tokens de design do painel (PEG baseline + brand Aluguei), espelhados
 * localmente para o app mobile — o app não pode depender de @aluguei/ui (web).
 */
export const colors = {
  canvas: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceSubtle: '#F7F7F8',
  surfaceMuted: '#F2F2F3',
  border: '#E5E5E7',
  borderStrong: '#D5D5D8',
  textPrimary: '#171719',
  textSecondary: '#5F6065',
  textTertiary: '#8E8F94',
  textDisabled: '#B6B7BB',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#2563EB',
  brand: '#41945D',
  brandStrong: '#417D55',
  brandSubtle: '#E9F1EB',
  brandOn: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

export const typography = {
  body: { fontSize: 14, lineHeight: 21 },
  bodyLg: { fontSize: 16, lineHeight: 24 },
  h4: { fontSize: 18, lineHeight: 26, fontWeight: '600' as const },
  h3: { fontSize: 24, lineHeight: 32, fontWeight: '600' as const },
  label: { fontSize: 12, lineHeight: 18 },
} as const;
