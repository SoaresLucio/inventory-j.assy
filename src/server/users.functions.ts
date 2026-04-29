import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const socialToEmail = (social: string) =>
  `${social.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_")}@jassy.local`;

async function assertGestor(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!data?.some((r: { role: string }) => r.role === "gestor")) {
    throw new Error("Acesso restrito ao gestor.");
  }
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertGestor(context.supabase, context.userId);

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(error.message);

    const ids = list.users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }, { data: items }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, social_name, points").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("inventory_items").select("user_id").in("user_id", ids),
    ]);

    const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = rMap.get(r.user_id) ?? [];
      arr.push(r.role);
      rMap.set(r.user_id, arr);
    });
    const cMap = new Map<string, number>();
    (items ?? []).forEach((i) => cMap.set(i.user_id, (cMap.get(i.user_id) ?? 0) + 1));

    return list.users.map((u) => {
      const p = pMap.get(u.id);
      const userRoles = rMap.get(u.id) ?? [];
      return {
        id: u.id,
        email: u.email ?? "",
        social_name: p?.social_name ?? u.email?.split("@")[0] ?? "",
        full_name: p?.full_name ?? "",
        points: p?.points ?? 0,
        roles: userRoles,
        is_gestor: userRoles.includes("gestor"),
        items_count: cMap.get(u.id) ?? 0,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    });
  });

const createSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  socialName: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(100),
  role: z.enum(["inventarista", "gestor"]).default("inventarista"),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertGestor(context.supabase, context.userId);

    const email = socialToEmail(data.socialName);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, social_name: data.socialName },
    });
    if (error) throw new Error(error.message);
    if (!created.user) throw new Error("Falha ao criar usuário.");

    // Trigger creates profile + default inventarista role.
    // Promote to gestor if requested.
    if (data.role === "gestor") {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", created.user.id);
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: created.user.id, role: "gestor" });
    }

    return { id: created.user.id, email };
  });

const deleteSchema = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertGestor(context.supabase, context.userId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir sua própria conta.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const resetSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(6).max(100),
});

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resetSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertGestor(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["inventarista", "gestor"]),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roleSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertGestor(context.supabase, context.userId);
    if (data.userId === context.userId && data.role !== "gestor") {
      throw new Error("Você não pode remover seu próprio acesso de gestor.");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
