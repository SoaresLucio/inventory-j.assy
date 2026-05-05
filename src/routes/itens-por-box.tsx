import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { parseEnderecoPayload, type ParsedEndereco } from "@/lib/qr-parse";
import { MapPin, Package, Search, Warehouse, LayoutGrid, Box as BoxIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/itens-por-box")({
  component: () => (
    <ProtectedShell>
      <ItensPorBoxPage />
    </ProtectedShell>
  ),
  head: () => ({
    meta: [
      { title: "Itens por Box — Inventário J.assy" },
      { name: "description", content: "Consulte itens registrados em um endereço logístico." },
    ],
  }),
});

interface ItemRow {
  id: string;
  item_code: string;
  uc: string;
  lote: string;
  quantidade: number;
  created_at: string;
  endereco: string;
}

function ItensPorBoxPage() {
  const [endereco, setEndereco] = useState<ParsedEndereco | null>(null);
  const [manual, setManual] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["itens-por-box", endereco?.canonical],
    enabled: !!endereco,
    queryFn: async () => {
      // Busca por canonical OU pelo display literal (fallback p/ registros antigos).
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id, item_code, uc, lote, quantidade, created_at, endereco")
        .or(
          `endereco.eq.${endereco!.canonical},endereco.ilike.%GALPAO${endereco!.galpao}%PRAT${endereco!.prateleira}%BOX${endereco!.box}%`,
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const handleScan = useCallback((raw: string) => {
    const parsed = parseEnderecoPayload(raw);
    if (!parsed) {
      toast.error("Endereço inválido. Esperado: GALPAOxx PRATx BOXxxA");
      return;
    }
    setEndereco(parsed);
    setManual(parsed.canonical);
    toast.success(`Endereço lido: ${parsed.display}`);
  }, []);

  const handleManualSearch = () => {
    const parsed = parseEnderecoPayload(manual);
    if (!parsed) {
      toast.error("Formato não reconhecido. Ex: 0E|GALPAO08PRAT6BOX07A");
      return;
    }
    setEndereco(parsed);
  };

  const totalQtd = data?.reduce((acc, it) => acc + (it.quantidade ?? 0), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Itens por Box</h1>
        <p className="text-sm text-muted-foreground">
          Escaneie o QR Code do endereço logístico ou digite manualmente.
        </p>
      </div>

      <Card className="p-4 shadow-[var(--shadow-card)] space-y-3">
        <div className="space-y-2">
          <Label htmlFor="endereco-manual">Endereço (QR / manual)</Label>
          <div className="flex gap-2">
            <Input
              id="endereco-manual"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ex: 0E|GALPAO08PRAT6BOX07A ou G8 P6 B7A"
              className="h-12 text-base font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleManualSearch();
                }
              }}
            />
            <BarcodeScanner onDetected={handleScan} />
            <Button type="button" size="lg" className="h-12" onClick={handleManualSearch} aria-label="Buscar">
              <Search className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O prefixo <span className="font-mono">0E|</span> é ignorado. Reconhece <span className="font-mono">GALPAO · PRAT · BOX</span>.
          </p>
        </div>
      </Card>

      {endereco && (
        <Card className="p-4 bg-[var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elevated)]">
          <div className="flex items-center gap-3">
            <MapPin className="h-6 w-6" />
            <div className="flex-1">
              <div className="text-xs opacity-80">Localização</div>
              <div className="font-display font-bold text-lg leading-tight">{endereco.display}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-md bg-primary-foreground/15 px-2 py-1.5 text-center">
              <Warehouse className="h-3.5 w-3.5 mx-auto opacity-80" />
              <div className="text-[10px] opacity-80 mt-0.5">Galpão</div>
              <div className="font-mono font-bold text-sm">{endereco.galpao}</div>
            </div>
            <div className="rounded-md bg-primary-foreground/15 px-2 py-1.5 text-center">
              <LayoutGrid className="h-3.5 w-3.5 mx-auto opacity-80" />
              <div className="text-[10px] opacity-80 mt-0.5">Prat.</div>
              <div className="font-mono font-bold text-sm">{endereco.prateleira}</div>
            </div>
            <div className="rounded-md bg-primary-foreground/15 px-2 py-1.5 text-center">
              <BoxIcon className="h-3.5 w-3.5 mx-auto opacity-80" />
              <div className="text-[10px] opacity-80 mt-0.5">Box</div>
              <div className="font-mono font-bold text-sm">{endereco.box}</div>
            </div>
          </div>
        </Card>
      )}

      {endereco && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base">
              Itens encontrados {data ? `(${data.length})` : ""}
            </h2>
            {data && data.length > 0 && (
              <Badge variant="secondary" className="font-mono">Qtd total: {totalQtd}</Badge>
            )}
          </div>

          {(isLoading || isFetching) && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-4 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </Card>
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <Card className="p-10 text-center">
              <Package className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">Nenhum item registrado neste endereço.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden shadow-[var(--shadow-card)]">
              <div className="px-4 py-2 bg-muted/50 border-b text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                Manifesto · {endereco.display}
              </div>
              <ul className="divide-y">
                {data.map((it) => (
                  <li key={it.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-sm truncate">{it.item_code}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        UC <span className="font-mono">{it.uc}</span> · Lote <span className="font-mono">{it.lote}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(it.created_at), "dd/MM HH:mm")}
                      </div>
                    </div>
                    <Badge className="shrink-0 font-mono">×{it.quantidade}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
