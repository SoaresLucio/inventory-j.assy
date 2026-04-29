import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProtectedShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Package } from "lucide-react";

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
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["inventory", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Meu histórico</h1>
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