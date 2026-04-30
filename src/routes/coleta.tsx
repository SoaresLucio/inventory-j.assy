import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProtectedShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { enqueueItem, flushQueue, pendingCount } from "@/lib/offline-queue";
import { CheckCircle2, CloudOff, Loader2, Send, WifiOff, Sparkles } from "lucide-react";
import { UCRecurrenceAlert, type UCExisting } from "@/components/UCRecurrenceAlert";

export const Route = createFileRoute("/coleta")({
  component: () => (
    <ProtectedShell>
      <ColetaPage />
    </ProtectedShell>
  ),
  head: () => ({
    meta: [
      { title: "Coleta — Inventário J.assy" },
      { name: "description", content: "Registre itens do inventário com leitor de código de barras." },
    ],
  }),
});

const schema = z.object({
  item_code: z.string().trim().min(1, "Código obrigatório").max(80),
  uc: z.string().trim().min(1, "UC obrigatória").max(40),
  lote: z.string().trim().min(1, "Lote obrigatório").max(40),
  endereco: z.string().trim().min(1, "Endereço obrigatório").max(60),
  quantidade: z.coerce.number().int("Use número inteiro").positive("Quantidade deve ser maior que 0").max(999999, "Quantidade muito alta"),
});

function ColetaPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const itemRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [item, setItem] = useState("");
  const [uc, setUc] = useState("");
  const [lote, setLote] = useState("");
  const [endereco, setEndereco] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [lastCount, setLastCount] = useState(0);
  const [floatPts, setFloatPts] = useState(0);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [dismissedUc, setDismissedUc] = useState<string | null>(null);

  const refreshPending = () => pendingCount().then(setPending);

  useEffect(() => {
    refreshPending();
    const goOnline = async () => {
      setOnline(true);
      const { ok } = await flushQueue();
      if (ok > 0) toast.success(`${ok} registro(s) sincronizado(s)`);
      refreshPending();
      qc.invalidateQueries({ queryKey: ["inventory"] });
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [qc]);

  useEffect(() => {
    itemRef.current?.focus();
  }, []);

  // Smart Check: consulta UC quando estabilizada (debounce simples)
  const ucTrimmed = uc.trim();
  const ucToCheck = ucTrimmed.length >= 6 && ucTrimmed !== dismissedUc ? ucTrimmed : "";

  const { data: existing, isFetching: checkingUc } = useQuery({
    queryKey: ["uc-check", ucToCheck],
    enabled: !!ucToCheck && online,
    staleTime: 10_000,
    queryFn: async (): Promise<UCExisting | null> => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id, uc, item_code, lote, endereco, quantidade, created_at, user_id")
        .eq("uc", ucToCheck)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      // busca nome social do autor
      const { data: prof } = await supabase
        .from("profiles")
        .select("social_name")
        .eq("id", row.user_id)
        .maybeSingle();
      return {
        id: row.id,
        uc: row.uc,
        item_code: row.item_code,
        lote: row.lote,
        endereco: row.endereco,
        quantidade: row.quantidade,
        created_at: row.created_at,
        user_social_name: prof?.social_name ?? null,
      };
    },
  });

  const mutation = useMutation({
    mutationFn: async (vals: z.infer<typeof schema>) => {
      if (!user) throw new Error("Não autenticado");

      // Modo "sobrescrever": atualiza o registro existente em vez de criar novo
      if (overrideId && navigator.onLine) {
        const { error } = await supabase
          .from("inventory_items")
          .update({
            item_code: vals.item_code,
            uc: vals.uc,
            lote: vals.lote,
            endereco: vals.endereco,
            quantidade: vals.quantidade,
          })
          .eq("id", overrideId);
        if (error) throw error;
        return { offline: false, override: true };
      }

      const client_id = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = { ...vals, user_id: user.id, client_id, created_at: new Date().toISOString() };
      if (!navigator.onLine) {
        await enqueueItem(payload);
        return { offline: true, override: false };
      }
      const { error } = await supabase.from("inventory_items").insert(payload);
      if (error) {
        await enqueueItem(payload);
        return { offline: true, override: false };
      }
      return { offline: false, override: false };
    },
    onSuccess: (res) => {
      setLastCount((c) => c + 1);
      const qty = parseInt(quantidade, 10) || 1;
      setFloatPts(qty * 10);
      setTimeout(() => setFloatPts(0), 1200);
      if (res.offline) {
        toast.info("Salvo offline. Sincroniza ao voltar a conexão.");
        refreshPending();
      } else if (res.override) {
        toast.success("Registro atualizado (sobrescrito)");
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["uc-check"] });
      } else {
        toast.success("Registro enviado!");
        qc.invalidateQueries({ queryKey: ["inventory"] });
      }
      // Reset apenas Item, Lote, UC (após sobrescrever, limpa UC também)
      setItem("");
      setLote("");
      setUc("");
      setQuantidade("1");
      setOverrideId(null);
      setDismissedUc(null);
      setTimeout(() => itemRef.current?.focus(), 50);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = schema.safeParse({ item_code: item, uc, lote, endereco, quantidade });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    // Bloqueia salvar se houver UC duplicada não tratada
    if (existing && !overrideId && ucTrimmed !== dismissedUc) {
      toast.error("UC já cadastrada — escolha Sobrescrever ou Cancelar");
      return;
    }
    mutation.mutate(parsed.data);
  };

  const handleScan = useCallback((p: { uc: string; item_code: string; lote: string }) => {
    setUc(p.uc);
    setItem(p.item_code);
    setLote(p.lote);
    setOverrideId(null);
    setDismissedUc(null);
    toast.success("QR lido — UC, Item e Lote preenchidos");
    setTimeout(() => itemRef.current?.focus(), 50);
  }, []);

  const handleOverride = () => {
    if (!existing) return;
    setOverrideId(existing.id);
    // Pré-preenche endereço se vazio (ajuda o usuário)
    if (!endereco) setEndereco(existing.endereco);
    toast.info("Modo sobrescrever ativo — ao salvar, o registro será atualizado");
  };

  const handleCancelExisting = () => {
    setDismissedUc(ucTrimmed);
    setOverrideId(null);
  };

  const showAlert = !!ucToCheck && (checkingUc || !!existing);

  return (
    <div className="space-y-4">
      {floatPts > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center">
          <div className="animate-[floatup_1.2s_ease-out_forwards] flex items-center gap-1.5 rounded-full bg-[var(--gradient-primary)] px-4 py-2 text-primary-foreground shadow-[var(--shadow-elevated)] font-display font-bold">
            <Sparkles className="h-4 w-4" /> +{floatPts} pts
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nova coleta</h1>
          <p className="text-sm text-muted-foreground">Sessão: {lastCount} item(ns) registrado(s)</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          {!online && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-warning/15 text-foreground">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </span>
          )}
          {pending > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent text-accent-foreground">
              <CloudOff className="h-3.5 w-3.5" /> {pending} aguardando
            </span>
          )}
        </div>
      </div>

      {showAlert && (
        <UCRecurrenceAlert
          loading={checkingUc && !existing}
          existing={existing ?? null}
          onOverride={handleOverride}
          onCancel={handleCancelExisting}
        />
      )}

      <Card className="p-5 shadow-[var(--shadow-card)]">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item">Código do item</Label>
            <div className="flex gap-2">
              <Input
                ref={itemRef}
                id="item"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="Escaneie ou digite"
                inputMode="text"
                autoComplete="off"
                required
                className="h-12 text-base font-mono"
              />
              <BarcodeScanner onParsed={handleScan} />
            </div>
            <p className="text-xs text-muted-foreground">
              Dica: use o <span className="font-semibold">QR Code</span> para preencher UC, Item e Lote automaticamente.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="uc">UC</Label>
              <Input
                id="uc"
                value={uc}
                onChange={(e) => {
                  setUc(e.target.value);
                  setOverrideId(null);
                  setDismissedUc(null);
                }}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lote">Lote</Label>
              <Input id="lote" value={lote} onChange={(e) => setLote(e.target.value)} required className="h-12 text-base" />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço (galpão)</Label>
              <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="ex: A-12-03" required className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade</Label>
              <Input
                id="quantidade"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
                className="h-12 text-base font-mono text-center"
              />
            </div>
          </div>

          <Button type="submit" disabled={mutation.isPending} className="w-full h-14 text-base shadow-[var(--shadow-elevated)]">
            {mutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                {overrideId ? "Sobrescrever registro" : "Salvar e enviar"}
              </>
            )}
          </Button>

          {lastCount > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              Endereço mantido para a próxima leitura
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
