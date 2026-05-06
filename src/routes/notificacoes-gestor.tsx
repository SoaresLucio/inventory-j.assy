import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { sendManagerNotification } from "@/server/notifications.functions";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Send, Users, MessageSquare, Bell } from "lucide-react";

export const Route = createFileRoute("/notificacoes-gestor")({
  component: () => (
    <ProtectedShell requireGestor>
      <NotificacoesGestorPage />
    </ProtectedShell>
  ),
  head: () => ({
    meta: [
      { title: "Enviar Notificações — Inventário J.assy" },
      { name: "description", content: "Envie alertas Web Push para inventaristas individuais ou para todos." },
    ],
  }),
});

const TARGET_ALL = "__all__";

function NotificacoesGestorPage() {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendManagerNotification);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<string>(TARGET_ALL);

  const { data: profiles } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, social_name")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["notifications-sent"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, receiver_id, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const b = body.trim();
      if (t.length < 1 || t.length > 120) throw new Error("Título: 1–120 caracteres");
      if (b.length < 1 || b.length > 1000) throw new Error("Mensagem: 1–1000 caracteres");
      const receiver_id = target === TARGET_ALL ? null : target;
      return sendFn({ data: { title: t, body: b, receiver_id } });
    },
    onSuccess: (res) => {
      toast.success(
        `Enviado · ${res.push.sent} push, ${res.push.failed} falhas, ${res.push.removed} inativos removidos`
      );
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["notifications-sent"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  const profileById = (id: string | null) => {
    if (!id) return null;
    return profiles?.find((p) => p.id === id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[var(--gradient-primary)] flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Enviar Notificações</h1>
          <p className="text-sm text-muted-foreground">
            Web Push para a barra de status do celular dos inventaristas
          </p>
        </div>
      </div>

      <Card className="p-5 space-y-4 shadow-[var(--shadow-card)]">
        <div className="space-y-2">
          <Label htmlFor="dest">Destinatário</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="dest" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TARGET_ALL}>
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4" /> Todos os usuários
                </span>
              </SelectItem>
              {profiles?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name} <span className="text-muted-foreground">({p.social_name})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ttl">Título</Label>
          <Input
            id="ttl"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Verificar Box G8 P1"
            maxLength={120}
            className="h-11"
          />
          <p className="text-[11px] text-muted-foreground text-right">{title.length}/120</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="msg">Mensagem</Label>
          <Textarea
            id="msg"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ex: Favor verificar divergência de lote no Box G8 P1 B7A."
            rows={4}
            maxLength={1000}
          />
          <p className="text-[11px] text-muted-foreground text-right">{body.length}/1000</p>
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !title.trim() || !body.trim()}
          className="w-full h-12 shadow-[var(--shadow-elevated)]"
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" /> Enviar notificação
            </>
          )}
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bell className="h-4 w-4" /> Histórico de envios
        </div>
        {loadingHistory ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !history || history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma notificação enviada ainda.</p>
        ) : (
          <div className="space-y-2">
            {history.map((n) => {
              const p = profileById(n.receiver_id);
              return (
                <div key={n.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{n.title}</h4>
                        {n.receiver_id === null ? (
                          <Badge variant="secondary" className="text-[10px]">Broadcast</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {p ? p.full_name : "Usuário"}
                          </Badge>
                        )}
                        {n.receiver_id !== null && (
                          <Badge
                            className={`text-[10px] ${n.is_read ? "bg-success/20 text-success-foreground" : "bg-muted"}`}
                          >
                            {n.is_read ? "Lido" : "Enviado"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.body}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {format(new Date(n.created_at), "dd/MM HH:mm")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
