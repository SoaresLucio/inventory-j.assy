// Parser do QR Code da J.assy.
//
// Regras observadas no campo:
//   • UC          → SEMPRE 9 dígitos numéricos
//   • Código Item → SEMPRE 11 dígitos numéricos (alguns SKUs internos podem vir com 13)
//   • Lote        → tamanho VARIÁVEL e pode conter LETRAS (ex.: "L23A45", "ABC123", "0001")
//
// O QR pode usar qualquer separador (|, ;, ,, espaço, tab, quebra de linha, -, /, :, _).
// Estratégia:
//   1) Quebra por separadores comuns.
//   2) Identifica UC e Item pelos seus tamanhos numéricos fixos.
//   3) O que sobrar (qualquer token alfanumérico restante) é o lote.
//   4) Fallback: se vier 1 string só, tenta UC(9) + Item(11) no início e o resto = lote.

export interface ParsedQR {
  uc: string;
  item_code: string;
  lote: string;
}

const UC_LEN = 9;
const ITEM_LENS = [11, 13]; // tamanhos aceitos de código de item

function isDigits(s: string) {
  return /^\d+$/.test(s);
}

function isAlnum(s: string) {
  return /^[A-Za-z0-9]+$/.test(s);
}

export function parseQrPayload(raw: string): ParsedQR | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;

  // 1) tokeniza por qualquer caractere fora de [A-Za-z0-9]
  const tokens = cleaned.split(/[^A-Za-z0-9]+/).filter(Boolean);

  if (tokens.length >= 2) {
    // procura UC (9 dígitos) e Item (11 ou 13 dígitos) — independentes da ordem
    let ucIdx = -1;
    let itemIdx = -1;

    tokens.forEach((t, i) => {
      if (ucIdx === -1 && isDigits(t) && t.length === UC_LEN) {
        ucIdx = i;
        return;
      }
      if (itemIdx === -1 && isDigits(t) && ITEM_LENS.includes(t.length) && i !== ucIdx) {
        itemIdx = i;
      }
    });

    if (ucIdx !== -1 && itemIdx !== -1) {
      // o lote é o primeiro token alfanumérico restante (qualquer tamanho, com ou sem letras)
      const loteTok = tokens.find(
        (t, i) => i !== ucIdx && i !== itemIdx && isAlnum(t),
      );
      if (loteTok) {
        return {
          uc: tokens[ucIdx],
          item_code: tokens[itemIdx],
          lote: loteTok,
        };
      }
    }
  }

  // 2) Fallback: string contínua sem separadores — tenta UC(9) + Item(11/13) + resto = lote
  if (/^[A-Za-z0-9]+$/.test(cleaned) && cleaned.length > UC_LEN + 11) {
    const uc = cleaned.slice(0, UC_LEN);
    if (isDigits(uc)) {
      for (const itemLen of ITEM_LENS) {
        const item = cleaned.slice(UC_LEN, UC_LEN + itemLen);
        const lote = cleaned.slice(UC_LEN + itemLen);
        if (isDigits(item) && lote.length > 0 && isAlnum(lote)) {
          return { uc, item_code: item, lote };
        }
      }
    }
  }

  return null;
}

// ---------------- Endereço logístico ----------------
//
// Formato típico: "0E|GALPAO08PRAT6BOX07A"
//   • Prefixo opcional "0E|" (ou variações) deve ser ignorado.
//   • Galpão: 1-2 dígitos após "GALPAO".
//   • Prateleira: 1-2 dígitos após "PRAT".
//   • Box: 1-3 caracteres alfanuméricos (ex.: "07A") após "BOX".

export interface ParsedEndereco {
  galpao: string;       // ex.: "08"
  prateleira: string;   // ex.: "6"
  box: string;          // ex.: "07A"
  /** Forma normalizada usada como chave no banco (campo `endereco`) */
  canonical: string;    // ex.: "GALPAO08-PRAT6-BOX07A"
  /** Apresentação amigável */
  display: string;      // ex.: "Galpão 08 · Prat 6 · Box 07A"
}

const ENDERECO_RE = /GALPAO\s*(\d{1,2})\s*PRAT\s*(\d{1,2})\s*BOX\s*([A-Z0-9]{1,4})/i;

export function parseEnderecoPayload(raw: string): ParsedEndereco | null {
  if (!raw) return null;
  // remove prefixo tipo "0E|" e espaços
  const cleaned = raw.trim().replace(/^[0-9A-Z]{1,3}\s*\|\s*/i, "").toUpperCase();
  const m = cleaned.match(ENDERECO_RE);
  if (!m) return null;
  const galpao = m[1].padStart(2, "0");
  const prateleira = String(parseInt(m[2], 10));
  const box = m[3].toUpperCase();
  return {
    galpao,
    prateleira,
    box,
    canonical: `GALPAO${galpao}-PRAT${prateleira}-BOX${box}`,
    display: `Galpão ${galpao} · Prat ${prateleira} · Box ${box}`,
  };
}

