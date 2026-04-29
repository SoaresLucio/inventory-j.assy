import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { ProtectedShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Download, Package } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/historico")({
  component: () => (
    <ProtectedShell>
      <HistoricoPage />
    </ProtectedShell>
  ),
  head: () => ({
    meta: [
      { title: "Histórico — Inventário J.assy" },
      { name: "description", content: "Itens que você inventariou recentemente." },
    ],
  }),
});

function HistoricoPage() {
  const { user, profile } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["inventory", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const exportXlsx = () => {
    if (!data || data.length === 0) {
      toast.error("Sem registros para exportar");
      return;
    }
    const ordered = [...data].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const sheet = XLSX.utils.json_to_sheet(
      ordered.map((r, i) => ({
        "#": i + 1,
        "Inventarista (login)": profile?.social_name ?? "",
        "Nome completo": profile?.full_name ?? "",
        "Código do Item": r.item_code,
        "Quantidade": r.quantidade,
        "UC": r.uc,
        "Lote": r.lote,
        "Endereço": r.endereco,
        "Data": format(new Date(r.created_at), "dd/MM/yyyy"),
        "Hora": format(new Date(r.created_at), "HH:mm:ss"),
        "ID do registro": r.id,
      })),
    );
    sheet["!cols"] = [
      { wch: 5 }, { wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 10 },
      { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 38 },
    ];
    sheet["!autofilter"] = { ref: `A1:K${ordered.length + 1}` };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Meu Inventário");
    const slug = (profile?.social_name ?? "inventarista").replace(/[^a-z0-9_-]/gi, "_");
    XLSX.writeFile(wb, `inventario_${slug}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
    toast.success(`Planilha gerada · ${ordered.length} registros`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Meu histórico</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} registros</p>
        </div>
        <Button onClick={exportXlsx} disabled={!data || data.length === 0} className="h-11">
          <Download className="h-4 w-4 mr-2" /> Exportar Excel
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !data || data.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhum item registrado ainda.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((it) => (
            <Card key={it.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-mono font-semibold">{it.item_code}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Qtd {it.quantidade} · UC {it.uc} · Lote {it.lote} · {it.endereco}
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-right shrink-0">
                {format(new Date(it.created_at), "dd/MM HH:mm")}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
