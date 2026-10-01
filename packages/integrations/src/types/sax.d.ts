/**
 * Tipos mínimos do `sax` (sem `@types/sax` no lockfile), só o que os testes do feed VRSync usam
 * para conferir que o XML é bem-formado no modo estrito.
 */
declare module 'sax' {
  export interface SAXParser {
    onerror: ((error: Error) => void) | null;
    error: Error | null;
    write(chunk: string): SAXParser;
    close(): SAXParser;
    resume(): SAXParser;
  }
  export function parser(strict: boolean, options?: { xmlns?: boolean }): SAXParser;
}
