import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { sendPushToAll } from "./push.server";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
});

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Apenas gestores podem disparar teste
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isGestor = roles?.some((r) => r.role === "gestor");
    if (!isGestor) throw new Error("Apenas gestores podem enviar push de teste");
    const result = await sendPushToAll({
      title: "🔔 Teste de notificação",
      body: "As notificações do J.assy estão funcionando!",
      url: "/coleta",
      tag: "jassy-test",
    });
    return result;
  });