import { format } from "date-fns";
import { parseAddress } from "@/utils/address-parser";

export interface InventoryRow {
  id: string;
  item_code: string;
  uc: string;
  lote: string;
  endereco: string;
  quantidade: number;
  user_id: string;
  created_at: string;
  social_name?: string;
  full_name?: string;
}

interface ExportOptions {
  rows: InventoryRow[];
  filename: string;
  sheetName?: string;
  /** Usuário fixo (usado na exportação do inventarista) */
  fixedUser?: { social_name: string; full_name: string };
  /** Inclui coluna de ID do usuário (apenas gestor) */
  includeUserId?: boolean;
}

/**
 * Exporta registros de inventário para .xlsx.
 * O pacote `xlsx` é importado dinamicamente para não pesar no bundle inicial.
 */
export async function exportInventoryXlsx({
  rows,
  filename,
  sheetName = "Inventário",
  fixedUser,
  includeUserId = false,
}: ExportOptions) {
  if (rows.length === 0) throw new Error("Sem registros para exportar");

  const XLSX = await import("xlsx");

  const ordered = [...rows].sort((a, b) => {
    const sa = fixedUser?.social_name ?? a.social_name ?? "";
    const sb = fixedUser?.social_name ?? b.social_name ?? "";
    const n = sa.localeCompare(sb, "pt-BR");
    if (n !== 0) return n;
    return a.created_at.localeCompare(b.created_at);
  });

  const data = ordered.map((r, i) => {
    const social = fixedUser?.social_name ?? r.social_name ?? "";
    const full = fixedUser?.full_name ?? r.full_name ?? "";
    const d = new Date(r.created_at);
    const addr = parseAddress(r.endereco);
    const localSimplificada = addr ? `G${parseInt(addr.galpao, 10)} P${addr.prateleira} B${addr.box.replace(/^0+/, "")}` : r.endereco;
    const enderecoOficial = addr ? addr.official : r.endereco;
    const base: Record<string, string | number> = {
      "#": i + 1,
      "Inventarista (login)": social,
      "Nome completo": full,
      "Código do Item": r.item_code,
      "Quantidade": r.quantidade,
      "UC": r.uc,
      "Lote": r.lote,
      "Endereço (Oficial)": enderecoOficial,
      "Localização Simplificada": localSimplificada,
      "Data": format(d, "dd/MM/yyyy"),
      "Hora": format(d, "HH:mm:ss"),
      "ID do registro": r.id,
    };
    if (includeUserId) base["ID do usuário"] = r.user_id;
    return base;
  });

  const sheet = XLSX.utils.json_to_sheet(data);
  const cols = [5, 22, 28, 16, 10, 12, 14, 26, 16, 12, 10, 38];
  if (includeUserId) cols.push(38);
  sheet["!cols"] = cols.map((wch) => ({ wch }));
  const lastColIdx = cols.length;
  const lastCol = lastColIdx <= 26 ? String.fromCharCode(64 + lastColIdx) : `A${String.fromCharCode(64 + lastColIdx - 26)}`;
  sheet["!autofilter"] = { ref: `A1:${lastCol}${ordered.length + 1}` };
  (sheet as Record<string, unknown>)["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  XLSX.writeFile(wb, filename);

  return ordered.length;
}

export const xlsxFilename = (prefix: string) =>
  `${prefix}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
