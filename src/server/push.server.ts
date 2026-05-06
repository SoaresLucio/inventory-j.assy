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

interface SendOpts {
  /** Se omitido, envia para todos. */
  userIds?: string[];
  /** Filtra apenas inventaristas que NÃO coletaram nada hoje. */
  onlyInventaristasSemColetaHoje?: boolean;
}

export async function sendPush(payload: PushPayload, opts: SendOpts = {}) {
  ensureWebPush();
  const admin = getAdminClient();

  let userIds = opts.userIds;

  if (opts.onlyInventaristasSemColetaHoje) {
    // 1) Pega inventaristas
    const { data: inventaristas, error: rerr } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "inventarista");
    if (rerr) throw rerr;
    const allInvs = (inventaristas ?? []).map((r) => r.user_id);

    // 2) Quem já registrou item hoje
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: hoje, error: ierr } = await admin
      .from("inventory_items")
      .select("user_id")
      .gte("created_at", startOfDay.toISOString());
    if (ierr) throw ierr;
    const jaColetaram = new Set((hoje ?? []).map((r) => r.user_id));

    userIds = allInvs.filter((id) => !jaColetaram.has(id));
    if (userIds.length === 0) return { sent: 0, removed: 0, failed: 0, targeted: 0 };
  }

  let q = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id");
  if (userIds && userIds.length > 0) q = q.in("user_id", userIds);
  const { data: subs, error } = await q;
  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0, removed: 0, failed: 0, targeted: userIds?.length ?? 0 };

  let sent = 0;
  let removed = 0;
  let failed = 0;
  const toRemove: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
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
  await admin
    .from("push_subscriptions")
    .update({ last_sent_at: new Date().toISOString() })
    .in("id", subs.filter((s) => !toRemove.includes(s.id)).map((s) => s.id));

  return { sent, removed, failed, targeted: userIds?.length ?? subs.length };
}

// Alias mantido para compatibilidade com chamadas antigas
export async function sendPushToAll(payload: PushPayload) {
  return sendPush(payload);
}