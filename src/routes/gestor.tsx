import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ProtectedShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Download, Filter, Package, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/gestor")({
  component: () => (
    <ProtectedShell requireGestor>
      <GestorPage />
    </ProtectedShell>
  ),
  head: () => ({
    meta: [
      { title: "Painel do Gestor — Inventário J.assy" },
      { name: "description", content: "Supervisão de registros de inventário e exportação para Excel." },
    ],
  }),
});

interface Row {
  id: string;
  item_code: string;
  uc: string;
  lote: string;
  endereco: string;
  quantidade: number;
  user_id: string;
  created_at: string;
  social_name: string;
  full_name: string;
}

function GestorPage() {
  const [userFilter, setUserFilter] = useState<string>("all");
  const [enderecoFilter, setEnderecoFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["inventory", "all"],
    queryFn: async () => {
      const [items, profs] = await Promise.all([
        supabase.from("inventory_items").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("profiles").select("*"),
      ]);
      if (items.error) throw items.error;
      if (profs.error) throw profs.error;
      const map = new Map(profs.data!.map((p) => [p.id, p]));
      const rows: Row[] = items.data!.map((it) => {
        const p = map.get(it.user_id);
        return {
          ...it,
          social_name: p?.social_name ?? "—",
          full_name: p?.full_name ?? "—",
        };
      });
      return { rows, profiles: profs.data! };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => {
      if (userFilter !== "all" && r.user_id !== userFilter) return false;
      if (enderecoFilter && !r.endereco.toLowerCase().includes(enderecoFilter.toLowerCase())) return false;
      if (dateFilter && !r.created_at.startsWith(dateFilter)) return false;
      return true;
    });
  }, [data, userFilter, enderecoFilter, dateFilter]);

  const totals = useMemo(() => {
    const users = new Set(filtered.map((r) => r.user_id));
    const qty = filtered.reduce((s, r) => s + (r.quantidade ?? 0), 0);
    return { items: filtered.length, users: users.size, qty };
  }, [filtered]);

  const exportXlsx = () => {
    if (filtered.length === 0) return toast.error("Sem registros para exportar");
    const sheet = XLSX.utils.json_to_sheet(
      filtered.map((r) => ({
        "Código do Item": r.item_code,
        "Quantidade": r.quantidade,
        "UC": r.uc,
        "Lote": r.lote,
        "Endereço": r.endereco,
        "Inventarista (nome social)": r.social_name,
        "Nome completo": r.full_name,
        "Data/Hora": format(new Date(r.created_at), "dd/MM/yyyy HH:mm:ss"),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Inventario");
    XLSX.writeFile(wb, `inventario_jassy_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
    toast.success("Planilha gerada");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Painel do Gestor</h1>
          <p className="text-sm text-muted-foreground">Supervisão e auditoria de coletas</p>
        </div>
        <Button onClick={exportXlsx} className="h-11 shadow-[var(--shadow-elevated)]">
          <Download className="h-4 w-4 mr-2" /> Exportar Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totals.items}</div>
              <div className="text-xs text-muted-foreground">Registros · {totals.qty} un.</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totals.users}</div>
              <div className="text-xs text-muted-foreground">Inventaristas ativos</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
          <Filter className="h-4 w-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Inventarista</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {data?.profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.social_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Endereço contém</Label>
            <Input value={enderecoFilter} onChange={(e) => setEnderecoFilter(e.target.value)} placeholder="ex: A-12" className="h-11" />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>UC</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Inventarista</TableHead>
                <TableHead>Data/Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro</TableCell></TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-semibold">{r.item_code}</TableCell>
                    <TableCell className="text-right font-mono">{r.quantidade}</TableCell>
                    <TableCell>{r.uc}</TableCell>
                    <TableCell>{r.lote}</TableCell>
                    <TableCell>{r.endereco}</TableCell>
                    <TableCell className="text-sm">{r.social_name}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.created_at), "dd/MM HH:mm")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}