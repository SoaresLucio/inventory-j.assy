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
import { CheckCircle2, CloudOff, Loader2, Send, WifiOff, Sparkles, Lock, MapPin, Package } from "lucide-react";
import { UCRecurrenceAlert, type UCExisting } from "@/components/UCRecurrenceAlert";
import { parseEnderecoPayload } from "@/lib/qr-parse";

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
  const formRef = useRef<HTMLFormElement>(null);
  const [item, setItem] = useState("");
  const [uc, setUc] = useState("");
  const [lote, setLote] = useState("");
  const [endereco, setEndereco] = useState("");
  const [enderecoDisplay, setEnderecoDisplay] = useState("");
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
      const { data: prof } = await supabase
        .from("profiles")
        .select("social_name, full_name")
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
        user_full_name: prof?.full_name ?? null,
      };
    },
  });

  const mutation = useMutation({
    mutationFn: async (vals: z.infer<typeof schema>) => {
      if (!user) throw new Error("Não autenticado");

      const client_id = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = { ...vals, user_id: user.id, client_id, created_at: new Date().toISOString() };
      if (!navigator.onLine) {
        await enqueueItem(payload);
        return { offline: true, recount: !!overrideId };
      }
      const { error } = await supabase.from("inventory_items").insert(payload);
      if (error) {
        await enqueueItem(payload);
        return { offline: true, recount: !!overrideId };
      }
      return { offline: false, recount: !!overrideId };
    },
    onSuccess: (res) => {
      setLastCount((c) => c + 1);
      const qty = parseInt(quantidade, 10) || 1;
      setFloatPts(qty * 10);
      setTimeout(() => setFloatPts(0), 1200);
      if (res.offline) {
        toast.info("Salvo offline. Sincroniza ao voltar a conexão.");
        refreshPending();
      } else if (res.recount) {
        toast.success("Recontagem registrada (auditoria imutável preservada)");
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["uc-check"] });
      } else {
        toast.success("Registro enviado!");
        qc.invalidateQueries({ queryKey: ["inventory"] });
      }
      // Reset Item, UC, Lote — endereço PERMANECE para acelerar coletas no mesmo box
      setItem("");
      setLote("");
      setUc("");
      setQuantidade("1");
      setOverrideId(null);
      setDismissedUc(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const itemReady = !!item.trim() && !!uc.trim() && !!lote.trim();
  const enderecoReady = !!endereco.trim();
  const canSave = itemReady && enderecoReady && !mutation.isPending;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!itemReady) return toast.error("Escaneie primeiro o QR Code do ITEM");
    if (!enderecoReady) return toast.error("Escaneie o QR Code do ENDEREÇO (Box)");
    const parsed = schema.safeParse({ item_code: item, uc, lote, endereco, quantidade });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (existing && !overrideId && ucTrimmed !== dismissedUc) {
      toast.error("UC já cadastrada — escolha Sobrescrever ou Cancelar");
      return;
    }
    mutation.mutate(parsed.data);
  };

  const handleScanItem = useCallback((p: { uc: string; item_code: string; lote: string }) => {
    setUc(p.uc);
    setItem(p.item_code);
    setLote(p.lote);
    setOverrideId(null);
    setDismissedUc(null);
    toast.success("Item lido — UC, Código e Lote preenchidos");
  }, []);

  const handleScanEndereco = useCallback((raw: string) => {
    const parsed = parseEnderecoPayload(raw);
    if (!parsed) {
      toast.error("Endereço inválido. Esperado: 0E|GALPAOxxPRATxBOXxxA");
      return;
    }
    setEndereco(parsed.canonical);
    setEnderecoDisplay(parsed.display);
    toast.success(`Endereço: ${parsed.display}`);
  }, []);

  const handleOverride = () => {
    if (!existing) return;
    setOverrideId(existing.id);
    if (!endereco) {
      setEndereco(existing.endereco);
      setEnderecoDisplay(existing.endereco);
    }
    toast.info("Recontagem ativa — um NOVO registro será criado (auditoria preserva o anterior)");
  };

  const handleCancelExisting = () => {
    setDismissedUc(ucTrimmed);
    setOverrideId(null);
  };

  const clearEndereco = () => {
    setEndereco("");
    setEnderecoDisplay("");
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
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          {/* PASSO 1 — Item */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${itemReady ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</span>
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Package className="h-4 w-4" /> Escanear ITEM
                </Label>
              </div>
              {itemReady && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </div>
            <div className="flex gap-2">
              <BarcodeScanner
                onParsed={handleScanItem}
                variant="item"
                label="Escanear item"
                hintText="Esperado: UC(9 díg) · Item(11 díg) · Lote"
              />
              <div className="flex-1 grid grid-cols-3 gap-2">
                <ReadOnlyField label="UC" value={uc} placeholder="—" />
                <ReadOnlyField label="Item" value={item} placeholder="—" mono />
                <ReadOnlyField label="Lote" value={lote} placeholder="—" />
              </div>
            </div>
          </section>

          {/* PASSO 2 — Endereço */}
          <section className="space-y-3 pt-1 border-t">
            <div className="flex items-center justify-between pt-3">
              <div className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${enderecoReady ? "bg-warning text-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> Escanear LOCALIZAÇÃO (Box)
                </Label>
              </div>
              {enderecoReady && <CheckCircle2 className="h-4 w-4 text-warning" />}
            </div>
            <div className="flex gap-2">
              <BarcodeScanner
                onDetected={handleScanEndereco}
                variant="endereco"
                label="Escanear endereço"
                hintText="Esperado: 0E|GALPAOxxPRATxBOXxxA"
              />
              <div className="flex-1">
                <Input
                  value={enderecoDisplay || endereco}
                  readOnly
                  disabled
                  placeholder="Toque na câmera laranja"
                  className="h-12 text-base font-mono cursor-not-allowed bg-muted/40"
                  aria-label="Endereço escaneado"
                />
              </div>
              {endereco && (
                <Button type="button" variant="ghost" size="sm" className="h-12 px-2" onClick={clearEndereco} aria-label="Limpar endereço">
                  ✕
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" /> Digitação manual bloqueada — leitura obrigatória do QR.
            </p>
          </section>

          {/* Quantidade */}
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

          <Button type="submit" disabled={!canSave} className="w-full h-14 text-base shadow-[var(--shadow-elevated)]">
            {mutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                {overrideId ? "Salvar recontagem" : canSave ? "Salvar e enviar" : "Escaneie ITEM e ENDEREÇO"}
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

function ReadOnlyField({ label, value, placeholder, mono }: { label: string; value: string; placeholder?: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
      <div className={`h-10 px-2.5 flex items-center rounded-md border bg-muted/40 text-sm ${mono ? "font-mono" : ""} ${value ? "text-foreground" : "text-muted-foreground"} truncate`}>
        {value || placeholder}
      </div>
    </div>
  );
}
