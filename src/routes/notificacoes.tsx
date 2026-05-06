import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProtectedShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Bell, BellRing, MailCheck } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/notificacoes")({
  component: () => (
    <ProtectedShell>
      <NotificacoesPage />
    </ProtectedShell>
  ),
  head: () => ({
    meta: [
      { title: "Notificações — Inventário J.assy" },
      { name: "description", content: "Mensagens enviadas pelo gestor e alertas do sistema." },
    ],
  }),
});

interface NotifRow {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

function NotificacoesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<{ items: NotifRow[]; readBroadcasts: Set<string> }> => {
      const [notifRes, readRes] = await Promise.all([
        supabase
          .from("notifications")
          .select("id, sender_id, receiver_id, title, body, is_read, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("notification_reads").select("notification_id").eq("user_id", user!.id),
      ]);
      if (notifRes.error) throw notifRes.error;
      if (readRes.error) throw readRes.error;
      return {
        items: notifRes.data ?? [],
        readBroadcasts: new Set((readRes.data ?? []).map((r) => r.notification_id)),
      };
    },
  });

  // Marca tudo como lido ao abrir a página
  useEffect(() => {
    if (!user || !data) return;
    const items = data.items;
    const directosNaoLidos = items.filter((n) => n.receiver_id === user.id && !n.is_read);
    const broadcastsNaoLidos = items.filter(
      (n) => n.receiver_id === null && !data.readBroadcasts.has(n.id)
    );
    if (directosNaoLidos.length === 0 && broadcastsNaoLidos.length === 0) return;

    (async () => {
      if (directosNaoLidos.length > 0) {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .in(
            "id",
            directosNaoLidos.map((n) => n.id)
          );
      }
      if (broadcastsNaoLidos.length > 0) {
        await supabase.from("notification_reads").insert(
          broadcastsNaoLidos.map((n) => ({
            notification_id: n.id,
            user_id: user.id,
          }))
        );
      }
      // Limpa badge do app
      if ("clearAppBadge" in navigator) {
        (navigator as Navigator & { clearAppBadge?: () => Promise<void> })
          .clearAppBadge?.()
          .catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    })();
  }, [user, data, qc]);

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[var(--gradient-primary)] flex items-center justify-center">
          <BellRing className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            Mensagens do gestor e alertas do sistema
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <Bell className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Sem mensagens por enquanto.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const isBroadcast = n.receiver_id === null;
            const wasRead = isBroadcast
              ? data?.readBroadcasts.has(n.id)
              : n.is_read || n.receiver_id !== user?.id;
            return (
              <Card
                key={n.id}
                className={`p-4 ${!wasRead ? "border-primary/40 bg-accent/30" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{n.title}</h3>
                      {isBroadcast && (
                        <Badge variant="secondary" className="text-[10px]">
                          Para todos
                        </Badge>
                      )}
                      {!wasRead && (
                        <Badge className="text-[10px] bg-primary text-primary-foreground">
                          Nova
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {n.body}
                    </p>
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right shrink-0 flex flex-col items-end gap-1">
                    <span>{format(new Date(n.created_at), "dd/MM HH:mm")}</span>
                    {wasRead && <MailCheck className="h-3 w-3 text-success" />}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
