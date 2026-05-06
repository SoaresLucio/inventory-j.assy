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
import { enqueueItem, flushQueue, pendingCount, removePending } from "@/lib/offline-queue";
import { CheckCircle2, CloudOff, Loader2, Send, WifiOff, Sparkles, Lock, MapPin, Package } from "lucide-react";
import { UCRecurrenceAlert, type UCExisting } from "@/components/UCRecurrenceAlert";
import { parseAddress } from "@/utils/address-parser";

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
  type ConfirmState =
    | { status: "idle" }
    | { status: "verifying"; client_id: string; seq: number }
    | { status: "confirmed"; seq: number; item_code: string }
    | { status: "queued"; seq: number; client_id?: string };
  const [confirm, setConfirm] = useState<ConfirmState>({ status: "idle" });
  const queuedConfirmRef = useRef<{ client_id: string; seq: number } | null>(null);

  const refreshPending = () => pendingCount().then(setPending);

  // Atualiza o cache do histórico/painel imediatamente, sem esperar refetch
  const pushItemToCaches = useCallback((row: Record<string, unknown>) => {
    qc.setQueriesData({ queryKey: ["inventory"] }, (old: unknown) => {
      if (!old) return old;
      if (Array.isArray(old)) {
        if (old.some((r: { client_id?: string }) => r.client_id === row.client_id)) return old;
        return [row, ...old];
      }
      if (typeof old === "object" && "rows" in (old as Record<string, unknown>)) {
        const o = old as { rows: Array<{ client_id?: string }> };
        if (o.rows.some((r) => r.client_id === row.client_id)) return old;
        return { ...o, rows: [row, ...o.rows] };
      }
      return old;
    });
  }, [qc]);

  const confirmSavedItem = useCallback(async (client_id: string, seq: number) => {
    setConfirm((current) =>
      current.status === "confirmed" && current.seq === seq ? current : { status: "verifying", client_id, seq },
    );

    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: found } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("client_id", client_id)
        .maybeSingle();
      if (found) {
        setConfirm({ status: "confirmed", seq, item_code: found.item_code });
        if (queuedConfirmRef.current?.client_id === client_id) queuedConfirmRef.current = null;
        pushItemToCaches(found as Record<string, unknown>);
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["uc-check"] });
        return true;
      }
      await new Promise((r) => setTimeout(r, 600));
    }

    queuedConfirmRef.current = { client_id, seq };
    setConfirm({ status: "queued", seq, client_id });
    return false;
  }, [qc, pushItemToCaches]);

  const trySync = useCallback(async (silent = false) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const { ok, failed, synced } = await flushQueue();
    if (ok > 0) {
      if (!silent) toast.success(`${ok} registro(s) sincronizado(s)`);
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["uc-check"] });
      const queuedConfirm = queuedConfirmRef.current;
      const pendingConfirm = queuedConfirm ? synced.find((it) => it.client_id === queuedConfirm.client_id) : null;
      if (pendingConfirm && queuedConfirm) {
        await confirmSavedItem(pendingConfirm.client_id, queuedConfirm.seq);
      }
    } else if (failed > 0 && !silent) {
      toast.error(`${failed} registro(s) com falha — tentaremos novamente`);
    }
    refreshPending();
  }, [confirmSavedItem, qc]);

  useEffect(() => {
    refreshPending();
    // Tenta sincronizar ao montar (caso haja itens pendentes de sessão anterior)
    trySync(true);

    const goOnline = async () => {
      setOnline(true);
      await trySync();
    };
    const goOffline = () => setOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") trySync(true);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisibility);

    // Retry periódico enquanto houver pendentes e estiver online
    const interval = window.setInterval(() => {
      pendingCount().then((n) => {
        if (n > 0 && navigator.onLine) trySync(true);
        setPending(n);
      });
    }, 15_000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [qc, trySync]);

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
      const item_code = vals.item_code;
      const payload = { ...vals, user_id: user.id, client_id, created_at: new Date().toISOString() };

      // ONLINE-FIRST: tenta inserir imediatamente quando há conexão
      if (typeof navigator === "undefined" || navigator.onLine) {
        const { data: inserted, error } = await supabase
          .from("inventory_items")
          .insert(payload)
          .select("*")
          .maybeSingle();
        if (!error && inserted) {
          return { offline: false, recount: !!overrideId, client_id, item_code, row: inserted };
        }
        if (error && error.code === "23505") {
          // Já existia (mesmo client_id) — busca a linha existente
          const { data: existingRow } = await supabase
            .from("inventory_items")
            .select("*")
            .eq("client_id", client_id)
            .maybeSingle();
          return { offline: false, recount: !!overrideId, client_id, item_code, row: existingRow ?? null };
        }
        // Falhou (rede/servidor) — cai para fila offline
      }

      // Salva offline (anti-perda)
      await enqueueItem(payload);
      return { offline: true, recount: !!overrideId, client_id, item_code, row: null };
    },
    onSuccess: async (res) => {
      const seq = lastCount + 1;
      setLastCount(seq);
      const qty = parseInt(quantidade, 10) || 1;
      setFloatPts(qty * 10);
      setTimeout(() => setFloatPts(0), 1200);

      if (res.offline) {
        toast.info("Sem internet — salvo localmente e será enviado ao reconectar.");
        queuedConfirmRef.current = { client_id: res.client_id, seq };
        setConfirm({ status: "queued", seq, client_id: res.client_id });
        refreshPending();
        setTimeout(() => trySync(true), 2000);
      } else {
        toast.success(res.recount ? "Recontagem registrada" : "Registro enviado!");
        if (res.row) {
          // Confirmação INSTANTÂNEA — sem esperar polling
          setConfirm({ status: "confirmed", seq, item_code: res.item_code });
          pushItemToCaches(res.row as Record<string, unknown>);
          qc.invalidateQueries({ queryKey: ["inventory"] });
          if (res.recount) qc.invalidateQueries({ queryKey: ["uc-check"] });
        } else {
          // Fallback: polling para confirmar
          setConfirm({ status: "verifying", client_id: res.client_id, seq });
          confirmSavedItem(res.client_id, seq);
        }
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
    const parsed = parseAddress(raw);
    if (!parsed) {
      toast.error("Endereço inválido. Esperado: 0E|GALPAO08PRAT6BOX07A ou G8 P6 B7A");
      return;
    }
    setEndereco(parsed.canonical);
    setEnderecoDisplay(parsed.pretty);
    toast.success(`Endereço: ${parsed.display}`);
  }, []);

  const handleEnderecoTyping = useCallback((value: string) => {
    setEnderecoDisplay(value);
    const parsed = parseAddress(value);
    if (parsed) {
      setEndereco(parsed.canonical);
    } else {
      setEndereco("");
    }
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
                <EditableField label="UC" value={uc} onChange={(v) => { setUc(v); setOverrideId(null); setDismissedUc(null); }} placeholder="UC" />
                <EditableField label="Item" value={item} onChange={setItem} placeholder="Código" mono />
                <EditableField label="Lote" value={lote} onChange={setLote} placeholder="Lote" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Você pode escanear ou digitar manualmente os campos acima.
            </p>
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
                hintText="0E|GALPAO08PRAT6BOX07A ou G8 P6 B7A"
              />
              <div className="flex-1">
                <Input
                  value={enderecoDisplay}
                  onChange={(e) => handleEnderecoTyping(e.target.value)}
                  placeholder="Câmera ou digite: G8 P6 B7A"
                  className={`h-12 text-base font-mono ${enderecoReady ? "border-success ring-1 ring-success" : ""}`}
                  aria-label="Endereço (escaneado ou digitado)"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              {endereco && (
                <Button type="button" variant="ghost" size="sm" className="h-12 px-2" onClick={clearEndereco} aria-label="Limpar endereço">
                  ✕
                </Button>
              )}
            </div>
            {enderecoReady ? (
              <p className="text-[11px] text-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Reconhecido: {parseAddress(enderecoDisplay)?.pretty ?? endereco}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" /> Escaneie o QR ou digite a abreviação (G8 P6 B7A) — conversão automática.
              </p>
            )}
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

          {confirm.status !== "idle" && (
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                confirm.status === "confirmed"
                  ? "bg-success/15 text-success border border-success/30"
                  : confirm.status === "verifying"
                  ? "bg-muted text-muted-foreground"
                  : "bg-warning/15 text-foreground border border-warning/30"
              }`}
            >
              {confirm.status === "verifying" && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verificando nº {confirm.seq}...
                </>
              )}
              {confirm.status === "confirmed" && (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  ✓ Confirmado nº {confirm.seq} <span className="font-mono">({confirm.item_code})</span>
                </>
              )}
              {confirm.status === "queued" && (
                <>
                  <CloudOff className="h-3.5 w-3.5" />
                  Nº {confirm.seq} aguardando sincronização
                </>
              )}
            </div>
          )}

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

function EditableField({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-10 px-2.5 text-sm ${mono ? "font-mono" : ""}`}
        aria-label={label}
      />
    </div>
  );
}
