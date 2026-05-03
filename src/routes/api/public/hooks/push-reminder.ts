import { createFileRoute } from "@tanstack/react-router";
import { sendPushToAll } from "@/server/push.server";

export const Route = createFileRoute("/api/public/hooks/push-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const authHeader = request.headers.get("authorization");
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: { slot?: "morning" | "afternoon"; title?: string; message?: string } = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const slot = body.slot ?? "morning";
        const title = body.title?.slice(0, 80);
        const message = body.message?.slice(0, 200);
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