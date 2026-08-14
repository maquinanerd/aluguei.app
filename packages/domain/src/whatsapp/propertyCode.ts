/** Código curto do imóvel para WhatsApp/link — ex.: AP0012, CA0003, CO0007, TE0001. */
export const PROPERTY_CODE_RE = /\b(AP|CA|CO|TE)(\d{3,6})\b/i;

export function parsePropertyCode(text: string): string | null {
  const match = text.match(PROPERTY_CODE_RE);
  if (!match) {
    return null;
  }
  const prefix = match[1];
  const digits = match[2];
  if (!prefix || !digits) {
    return null;
  }
  return `${prefix.toUpperCase()}${digits}`;
}

export function codePrefixFor(propertyType: string): string {
  switch (propertyType) {
    case 'APARTMENT':
      return 'AP';
    case 'HOUSE':
      return 'CA';
    case 'COMMERCIAL':
      return 'CO';
    case 'LAND':
      return 'TE';
    default:
      return 'IM';
  }
}

export function formatCode(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}
