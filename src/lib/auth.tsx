import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "inventarista" | "gestor";

export interface AuthProfile {
  id: string;
  full_name: string;
  social_name: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (socialName: string, password: string) => Promise<void>;
  signUp: (data: { fullName: string; socialName: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Convert social name -> deterministic email for Supabase Auth
const socialToEmail = (social: string) =>
  `${social.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_")}@jassy.local`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfileAndRole = async (uid: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(prof ?? null);
    const isGestor = roles?.some((r) => r.role === "gestor");
    setRole(isGestor ? "gestor" : roles && roles.length > 0 ? "inventarista" : null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadProfileAndRole(s.user!.id), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfileAndRole(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (socialName: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: socialToEmail(socialName),
      password,
    });
    if (error) throw new Error("Nome social ou senha inválidos.");
  };

  const signUp = async ({ fullName, socialName, password }: { fullName: string; socialName: string; password: string }) => {
    const { error } = await supabase.auth.signUp({
      email: socialToEmail(socialName),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName, social_name: socialName.trim() },
      },
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) throw new Error("Este nome social já está em uso.");
      throw error;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}