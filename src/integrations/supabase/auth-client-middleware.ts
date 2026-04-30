import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

/**
 * Client-side middleware that attaches the current Supabase session's
 * access token as an Authorization header on every server function call.
 * Pair with `requireSupabaseAuth` (server middleware) on the same server fn.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const headers: Record<string, string> = {};
    if (typeof window !== "undefined") {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.authorization = `Bearer ${token}`;
    }
    return next({ headers });
  },
);
