// ============================================================================
// Address Parser — converte abreviações rápidas (G8 P6 B7A) para o padrão
// oficial usado nos QR Codes / banco: "0E|GALPAO08PRAT6BOX07A".
//
// Regras:
//   • G  (Galpão)    → "GALPAO" + 2 dígitos (zero à esquerda quando 1 dígito).
//   • P  (Prateleira)→ "PRAT"   + número (sem padding).
//   • B  (Box)       → "BOX"    + 2 dígitos + letra opcional (07A).
//   • Prefixo "0E|" é adicionado quando ausente.
//
// Aceita entradas como:
//   "G8 P6 B7A"          → { canonical:"GALPAO08-PRAT6-BOX07A", official:"0E|GALPAO08PRAT6BOX07A" }
//   "g08p6b07a"          → idem
//   "G8-P6-B7A"          → idem
//   "0E|GALPAO08PRAT6BOX07A" → idem
//   "GALPAO08PRAT6BOX07A"    → idem
// ============================================================================

export interface ParsedAddress {
  galpao: string;       // "08"
  prateleira: string;   // "6"
  box: string;          // "07A"
  /** Forma usada como CHAVE no banco (compatível com registros já existentes). */
  canonical: string;    // "GALPAO08-PRAT6-BOX07A"
  /** Forma oficial sem traços, como vem do QR Code real. */
  official: string;     // "0E|GALPAO08PRAT6BOX07A"
  /** Apresentação amigável p/ usuário. */
  display: string;      // "Galpão 08 · Prat 6 · Box 07A"
  /** Versão amigável longa para validação visual. */
  pretty: string;       // "Galpão 08, Prateleira 6, Box 07A"
}

// Aceita o formato OFICIAL (com ou sem prefixo "0E|", com ou sem separadores).
const OFFICIAL_RE = /GALPAO\s*(\d{1,2})\D*PRAT\s*(\d{1,2})\D*BOX\s*([A-Z0-9]{1,4})/i;

// Aceita ABREVIAÇÕES: G<n> P<n> B<n><letra?>
// Ex.: "G8 P6 B7A", "g08-p06-b07a", "G8P6B7A"
const ABBREV_RE = /\bG\s*0*(\d{1,2})\D*P\s*0*(\d{1,2})\D*B\s*0*(\d{1,2})\s*([A-Z])?\b/i;

function build(galpaoRaw: string, prateleiraRaw: string, boxNumRaw: string, boxLetter: string | undefined): ParsedAddress {
  const galpao = galpaoRaw.padStart(2, "0");
  const prateleira = String(parseInt(prateleiraRaw, 10));
  const boxNum = boxNumRaw.padStart(2, "0");
  const box = `${boxNum}${(boxLetter ?? "").toUpperCase()}`;
  return {
    galpao,
    prateleira,
    box,
    canonical: `GALPAO${galpao}-PRAT${prateleira}-BOX${box}`,
    official: `0E|GALPAO${galpao}PRAT${prateleira}BOX${box}`,
    display: `Galpão ${galpao} · Prat ${prateleira} · Box ${box}`,
    pretty: `Galpão ${galpao}, Prateleira ${prateleira}, Box ${box}`,
  };
}

/** Extrai um endereço a partir de QUALQUER input (oficial ou abreviado). */
export function parseAddress(raw: string): ParsedAddress | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/^0E\s*\|\s*/i, "");

  // 1) tenta formato OFICIAL primeiro (GALPAO/PRAT/BOX)
  const off = cleaned.match(OFFICIAL_RE);
  if (off) {
    const boxRaw = off[3].toUpperCase();
    const boxMatch = boxRaw.match(/^(\d{1,2})([A-Z])?$/);
    if (boxMatch) {
      return build(off[1], off[2], boxMatch[1], boxMatch[2]);
    }
    // Box que já vem como letra+número ou outro formato: trata todo o token
    return build(off[1], off[2], boxRaw.replace(/\D/g, "") || "0", boxRaw.match(/[A-Z]$/)?.[0]);
  }

  // 2) tenta formato ABREVIADO (G_ P_ B_)
  const ab = cleaned.match(ABBREV_RE);
  if (ab) {
    return build(ab[1], ab[2], ab[3], ab[4]);
  }

  return null;
}

/**
 * Normaliza um termo de busca para o filtro do gestor.
 * Retorna um array de fragmentos a procurar no campo `endereco` (ILIKE).
 * Aceita "G8", "P6", "B7A", "G8 B7", combinações e o próprio formato oficial.
 */
export function buildAddressSearchFragments(term: string): string[] {
  const t = term.trim().toUpperCase();
  if (!t) return [];

  // Se for um endereço completo (oficial ou abreviado) — usa canonical
  const full = parseAddress(t);
  if (full) return [full.canonical];

  const frags: string[] = [];
  // G<n>
  const g = t.match(/\bG\s*0*(\d{1,2})\b/);
  if (g) frags.push(`GALPAO${g[1].padStart(2, "0")}`);
  // P<n>
  const p = t.match(/\bP\s*0*(\d{1,2})\b/);
  if (p) frags.push(`PRAT${parseInt(p[1], 10)}`);
  // B<n><letra?>
  const b = t.match(/\bB\s*0*(\d{1,2})\s*([A-Z])?\b/);
  if (b) frags.push(`BOX${b[1].padStart(2, "0")}${(b[2] ?? "")}`);

  // Fallback — aceita pedaços já no padrão oficial
  if (frags.length === 0) {
    if (/GALPAO|PRAT|BOX/.test(t)) frags.push(t);
    else frags.push(t); // texto livre — busca direta
  }
  return frags;
}

/** True quando a string já está no formato oficial canônico do banco. */
export function isCanonicalAddress(s: string): boolean {
  return /^GALPAO\d{2}-PRAT\d{1,2}-BOX\d{2}[A-Z]?$/.test(s);
}
