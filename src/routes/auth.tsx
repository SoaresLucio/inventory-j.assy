import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useAuth } from "@/lib/auth";
import { Loader2, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Entrar — Inventário J.assy" },
      { name: "description", content: "Acesse sua conta J.assy para iniciar a contagem de estoque." },
    ],
  }),
});

const signInSchema = z.object({
  socialName: z.string().trim().min(2, "Mínimo 2 caracteres").max(60),
  password: z.string().min(6, "Mínimo 6 caracteres").max(100),
});

const signUpSchema = z.object({
  fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
  socialName: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9_]+$/, "Use letras, números ou _"),
  password: z.string().min(6, "Mínimo 6 caracteres").max(100),
});

function AuthPage() {
  const { user, role, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: role === "gestor" ? "/gestor" : "/coleta" });
    }
  }, [user, role, loading, navigate]);

  const handleForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const socialName = String(fd.get("socialName") ?? "").trim();
    const reason = String(fd.get("reason") ?? "").trim() || null;
    if (socialName.length < 2) return toast.error("Informe seu nome social.");
    setForgotSubmitting(true);
    try {
      const { error } = await supabase
        .from("password_reset_requests")
        .insert({ social_name: socialName, reason });
      if (error) {
        if (error.code === "23505") {
          toast.info("Você já tem um pedido pendente. Aguarde o gestor.");
        } else {
          throw error;
        }
      } else {
        toast.success("Pedido enviado! Procure um gestor para concluir.");
      }
      setForgotOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar pedido");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      socialName: fd.get("socialName"),
      password: fd.get("password"),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSubmitting(true);
    try {
      await signIn(parsed.data.socialName, parsed.data.password);
      toast.success("Bem-vindo!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      fullName: fd.get("fullName"),
      socialName: fd.get("socialName"),
      password: fd.get("password"),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSubmitting(true);
    try {
      await signUp(parsed.data);
      toast.success("Cadastro criado! Entrando...");
      await signIn(parsed.data.socialName, parsed.data.password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no cadastro");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background to-accent/30">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-[var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-elevated)]">
            <PackageCheck className="h-9 w-9 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">Inventário J.assy</h1>
          <p className="text-sm text-muted-foreground mt-1">Contagem de estoque, simples e rápida</p>
        </div>

        <div className="bg-card rounded-2xl border shadow-[var(--shadow-card)] p-6">
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="si-social">Nome social</Label>
              <Input id="si-social" name="socialName" autoComplete="username" placeholder="ex: joao_silva" required className="h-12 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="si-pass">Senha</Label>
              <Input id="si-pass" name="password" type="password" autoComplete="current-password" required className="h-12 text-base" />
            </div>
            <Button type="submit" disabled={submitting} className="w-full h-12 text-base">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
            </Button>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="w-full text-sm text-primary hover:underline text-center"
            >
              Esqueci minha senha
            </button>
            <p className="text-xs text-muted-foreground text-center pt-2 border-t">
              Novas contas são criadas apenas pelo gestor.
            </p>
          </form>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar acesso</DialogTitle>
            <DialogDescription>
              Informe seu nome social. O gestor receberá o pedido e definirá uma nova senha para você.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgot} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fg-social">Nome social (seu login)</Label>
              <Input id="fg-social" name="socialName" required minLength={2} maxLength={60} placeholder="ex: joao_silva" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fg-reason">Mensagem ao gestor (opcional)</Label>
              <Textarea id="fg-reason" name="reason" maxLength={500} placeholder="Ex: esqueci a senha após troca de turno" rows={3} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={forgotSubmitting} className="w-full">
                {forgotSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar pedido"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
