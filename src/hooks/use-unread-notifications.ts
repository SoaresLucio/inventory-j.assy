import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Conta notificações não lidas para o usuário atual
 * (mensagens dirigidas ainda não lidas + broadcasts ainda não marcados em notification_reads).
 */
export function useUnreadNotifications() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: !!user,
    refetchInterval: 30_000, // poll suave
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [directos, broadcasts, jaLidos] = await Promise.all([
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", user!.id)
          .eq("is_read", false),
        supabase
          .from("notifications")
          .select("id")
          .is("receiver_id", null)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("notification_reads")
          .select("notification_id")
          .eq("user_id", user!.id),
      ]);

      const direct = directos.count ?? 0;
      const lidos = new Set((jaLidos.data ?? []).map((r) => r.notification_id));
      const broadcastUnread = (broadcasts.data ?? []).filter((n) => !lidos.has(n.id)).length;
      return direct + broadcastUnread;
    },
  });

  // Sincroniza badge do app
  useEffect(() => {
    const n = query.data ?? 0;
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (n > 0 && nav.setAppBadge) nav.setAppBadge(n).catch(() => {});
    else if (nav.clearAppBadge) nav.clearAppBadge().catch(() => {});
  }, [query.data]);

  return query.data ?? 0;
}
