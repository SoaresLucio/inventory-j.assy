// Parser do QR Code: aceita 3 segmentos com tamanhos UC=9, Item=11, Lote=10.
// Separadores aceitos: |, ;, espaço, tab, nova linha, vírgula.
export interface ParsedQR {
  uc: string;
  item_code: string;
  lote: string;
}

export function parseQrPayload(raw: string): ParsedQR | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  // tenta separadores comuns
  const parts = cleaned.split(/[|;,\s\t\n\r]+/).filter(Boolean);
  let candidate: string[] | null = null;
  if (parts.length >= 3) {
    candidate = parts.slice(0, 3);
  } else if (cleaned.length === 9 + 11 + 10 && /^\d+$/.test(cleaned)) {
    // string numérica contínua de 30 dígitos
    candidate = [cleaned.slice(0, 9), cleaned.slice(9, 20), cleaned.slice(20, 30)];
  }
  if (!candidate) return null;
  const [uc, item_code, lote] = candidate;
  if (uc.length !== 9 || item_code.length !== 11 || lote.length !== 10) return null;
  if (!/^\d+$/.test(uc) || !/^\d+$/.test(item_code) || !/^\d+$/.test(lote)) return null;
  return { uc, item_code, lote };
}