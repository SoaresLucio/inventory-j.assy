import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProtectedShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Trophy, Medal, Award, RefreshCw, Sparkles } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/ranking")({
  component: () => (
    <ProtectedShell>
      <RankingPage />
    </ProtectedShell>
  ),
  head: () => ({
    meta: [
      { title: "Ranking — Inventário J.assy" },
      { name: "description", content: "Leaderboard dos inventaristas com mais coletas." },
    ],
  }),
});

interface RankingRow {
  user_id: string;
  social_name: string;
  points: number;
  items_today: number;
  items_week: number;
  items_total: number;
}

function RankingPage() {
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["ranking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranking_view" as never)
        .select("*")
        .order("points", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as RankingRow[]).filter((r) => r.points > 0 || r.items_total > 0);
    },
    refetchInterval: 30_000,
  });

  // Realtime: refetch ao detectar nova inserção
  useEffect(() => {
    const ch = supabase
      .channel("ranking-stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inventory_items" }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const top3 = data?.slice(0, 3) ?? [];
  const rest = data?.slice(3) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="h-6 w-6 text-primary" /> Ranking</h1>
          <p className="text-sm text-muted-foreground">Top inventaristas — atualiza em tempo real</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !data || data.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Ninguém pontuou ainda. Seja o primeiro!</p>
        </Card>
      ) : (
        <>
          {/* Pódio */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 0, 2].map((order) => {
              const r = top3[order];
              if (!r) return <div key={order} />;
              const styles = [
                { bg: "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950", icon: Trophy, h: "h-32" },   // 1
                { bg: "bg-gradient-to-b from-slate-300 to-slate-400 text-slate-900", icon: Medal, h: "h-24" },    // 2
                { bg: "bg-gradient-to-b from-orange-300 to-orange-500 text-orange-950", icon: Award, h: "h-20" }, // 3
              ][order];
              const Icon = styles.icon;
              return (
                <div key={r.user_id} className="flex flex-col items-center gap-2">
                  <Card className={`w-full ${styles.h} ${styles.bg} border-0 flex flex-col items-center justify-center p-2 shadow-[var(--shadow-elevated)]`}>
                    <Icon className="h-6 w-6" />
                    <div className="text-2xl font-display font-extrabold leading-none mt-1">{order + 1}º</div>
                    <div className="text-xs font-semibold mt-1">{r.points} pts</div>
                  </Card>
                  <div className="text-center">
                    <div className="text-sm font-semibold truncate max-w-[110px]">{r.social_name}</div>
                    <div className="text-[11px] text-muted-foreground">Hoje: {r.items_today}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lista */}
          <div className="space-y-2">
            {rest.map((r, i) => {
              const isMe = r.user_id === user?.id;
              return (
                <Card key={r.user_id} className={`p-3 flex items-center gap-3 ${isMe ? "ring-2 ring-primary" : ""}`}>
                  <div className="h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-display font-bold">
                    {i + 4}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{r.social_name} {isMe && <span className="text-xs text-primary">(você)</span>}</div>
                    <div className="text-xs text-muted-foreground">Hoje {r.items_today} · Semana {r.items_week} · Total {r.items_total}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-primary">{r.points}</div>
                    <div className="text-[10px] text-muted-foreground -mt-0.5">pts</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}