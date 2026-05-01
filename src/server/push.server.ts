import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let configured = false;
function ensureWebPush() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:admin@jassy.local";
  if (!pub || !priv) throw new Error("VAPID keys não configuradas no servidor");
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
}

export function getAdminClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToAll(payload: PushPayload) {
  ensureWebPush();
  const admin = getAdminClient();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0, removed: 0, failed: 0 };

  let sent = 0;
  let removed = 0;
  let failed = 0;
  const toRemove: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 30 }
        );
        sent++;
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          toRemove.push(s.id);
          removed++;
        } else {
          failed++;
        }
      }
    })
  );

  if (toRemove.length) {
    await admin.from("push_subscriptions").delete().in("id", toRemove);
  }
  // Marca último envio
  await admin
    .from("push_subscriptions")
    .update({ last_sent_at: new Date().toISOString() })
    .in("id", subs.filter((s) => !toRemove.includes(s.id)).map((s) => s.id));

  return { sent, removed, failed };
}