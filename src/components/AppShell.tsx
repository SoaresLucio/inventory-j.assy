import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ClipboardList, History, LayoutDashboard, LogOut, PackageCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  const navItems =
    role === "gestor"
      ? [
          { to: "/gestor", label: "Painel", icon: LayoutDashboard },
          { to: "/coleta", label: "Coletar", icon: ClipboardList },
          { to: "/historico", label: "Histórico", icon: History },
        ]
      : [
          { to: "/coleta", label: "Coletar", icon: ClipboardList },
          { to: "/historico", label: "Histórico", icon: History },
        ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link to={role === "gestor" ? "/gestor" : "/coleta"} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[var(--gradient-primary)] flex items-center justify-center">
              <PackageCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <div className="font-display font-bold text-sm">J.assy</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">
                {role === "gestor" ? "Gestor" : "Inventarista"}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm text-muted-foreground">{profile?.social_name}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-4 pb-24">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur md:static md:border-t md:bg-transparent">
        <div className="mx-auto max-w-5xl flex items-stretch justify-around">
          {navItems.map((it) => {
            const Icon = it.icon;
            const active = loc.pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function ProtectedShell({ children, requireGestor = false }: { children: ReactNode; requireGestor?: boolean }) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    queueMicrotask(() => navigate({ to: "/auth" }));
    return null;
  }

  if (requireGestor && role !== "gestor") {
    return (
      <AppShell>
        <div className="text-center py-16">
          <h2 className="text-xl font-bold">Acesso restrito</h2>
          <p className="text-muted-foreground mt-2">Apenas gestores podem acessar esta página.</p>
        </div>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}