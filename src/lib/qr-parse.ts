// Parser do QR Code: identifica 3 segmentos numéricos com tamanhos
// UC=9, Item=11 (ou 13 — alguns SKUs internos vêm com 13 dígitos), Lote=10.
// Aceita praticamente qualquer separador (|, ;, ,, espaço, tab, quebra de linha,
// -, /, :, _) e também strings numéricas contínuas de 30 dígitos.
export interface ParsedQR {
  uc: string;
  item_code: string;
  lote: string;
}

const UC_LEN = 9;
const ITEM_LEN = 11;
const LOTE_LEN = 10;

function onlyDigits(s: string) {
  return s.replace(/\D+/g, "");
}

function tryByLengths(parts: string[]): ParsedQR | null {
  // mapeia somente partes 100% numéricas
  const nums = parts.map(onlyDigits).filter((p) => p.length > 0);
  if (nums.length < 3) return null;

  const uc = nums.find((n) => n.length === UC_LEN);
  const item = nums.find((n) => n.length === ITEM_LEN);
  const lote = nums.find((n) => n.length === LOTE_LEN);
  if (uc && item && lote) return { uc, item_code: item, lote };

  // fallback: assume ordem UC, Item, Lote nos 3 primeiros segmentos numéricos
  const [a, b, c] = nums;
  if (
    a?.length === UC_LEN &&
    b?.length === ITEM_LEN &&
    c?.length === LOTE_LEN
  ) {
    return { uc: a, item_code: b, lote: c };
  }
  return null;
}

export function parseQrPayload(raw: string): ParsedQR | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;

  // 1) split por qualquer caractere que não seja dígito como separador
  // (mais tolerante: |, ;, ,, espaço, tab, \n, -, /, :, _, etc.)
  const parts = cleaned.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const byParts = tryByLengths(parts);
  if (byParts) return byParts;

  // 2) string numérica contínua (30 dígitos) — extrai apenas dígitos
  const digits = onlyDigits(cleaned);
  if (digits.length === UC_LEN + ITEM_LEN + LOTE_LEN) {
    return {
      uc: digits.slice(0, UC_LEN),
      item_code: digits.slice(UC_LEN, UC_LEN + ITEM_LEN),
      lote: digits.slice(UC_LEN + ITEM_LEN),
    };
  }

  return null;
}
