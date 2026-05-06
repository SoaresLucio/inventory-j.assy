import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

const SendSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  // null/omitido = broadcast (todos)
  receiver_id: z.string().uuid().nullable().optional(),
});

export const sendManagerNotification = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input) => SendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verifica gestor
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isGestor = roles?.some((r) => r.role === "gestor");
    if (!isGestor) throw new Error("Apenas gestores podem enviar notificações");

    const receiver_id = data.receiver_id ?? null;

    // 1) Persiste no banco — RLS valida sender_id = auth.uid()
    const { data: inserted, error: insErr } = await supabase
      .from("notifications")
      .insert({
        sender_id: userId,
        receiver_id,
        title: data.title,
        body: data.body,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // 2) Dispara push (server-only)
    const { sendPush } = await import("./push.server");
    const pushResult = await sendPush(
      {
        title: data.title,
        body: data.body,
        url: "/notificacoes",
        tag: `jassy-msg-${inserted.id}`,
      },
      receiver_id ? { userIds: [receiver_id] } : {}
    );

    return { id: inserted.id, push: pushResult };
  });
