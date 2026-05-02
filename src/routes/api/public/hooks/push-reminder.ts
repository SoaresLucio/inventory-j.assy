import { createFileRoute } from "@tanstack/react-router";
import { sendPushToAll } from "@/server/push.server";

export const Route = createFileRoute("/api/public/hooks/push-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared-secret check: only the cron scheduler should be able to broadcast pushes
        const secret = process.env.CRON_SECRET;
        const provided = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!secret || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: { slot?: "morning" | "afternoon"; title?: string; message?: string } = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const slot = body.slot ?? "morning";
        const presets = {
          morning: {
            title: "☀️ Bom dia, J.assy!",
            body: "07:20 — Hora de iniciar as coletas e registrar seu inventário.",
          },
          afternoon: {
            title: "🕐 Boa tarde, J.assy!",
            body: "13:20 — Retomada da contagem. Vamos manter o ritmo!",
          },
        } as const;
        const preset = presets[slot] ?? presets.morning;
        const result = await sendPushToAll({
          title: body.title ?? preset.title,
          body: body.message ?? preset.body,
          url: "/coleta",
          tag: `jassy-${slot}`,
        });
        return Response.json({ ok: true, slot, ...result });
      },
    },
  },
});