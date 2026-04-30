import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ProtectedShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Key, Loader2, Plus, Search, Trash2, UserCog, Users, KeyRound, Check, X } from "lucide-react";
import {
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  setUserRole,
} from "@/server/users.functions";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/usuarios")({
  component: () => (
    <ProtectedShell requireGestor>
      <UsuariosPage />
    </ProtectedShell>
  ),
  head: () => ({
    meta: [
      { title: "Usuários — Inventário J.assy" },
      { name: "description", content: "Gerenciamento de inventaristas e gestores." },
    ],
  }),
});

function UsuariosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string; requestId?: string } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listUsers(),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.social_name.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const createMut = useMutation({
    mutationFn: (data: {
      fullName: string;
      socialName: string;
      password: string;
      role: "inventarista" | "gestor";
    }) => createUser({ data }),
    onSuccess: () => {
      toast.success("Usuário criado com sucesso");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setOpenCreate(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar"),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => deleteUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const resetMut = useMutation({
    mutationFn: (data: { userId: string; password: string }) => resetUserPassword({ data }),
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao redefinir"),
  });

  const roleMut = useMutation({
    mutationFn: (data: { userId: string; role: "inventarista" | "gestor" }) =>
      setUserRole({ data }),
    onSuccess: () => {
      toast.success("Acesso atualizado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  // Pedidos de redefinição de senha pendentes
  const { data: resetRequests = [] } = useQuery({
    queryKey: ["password-reset-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("password_reset_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const rejectRequestMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("password_reset_requests")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido rejeitado");
      qc.invalidateQueries({ queryKey: ["password-reset-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const handleResolveRequest = async (req: { id: string; social_name: string }) => {
    // Encontra o usuário pelo nome social
    const target = users.find(
      (u) => u.social_name.toLowerCase() === req.social_name.toLowerCase(),
    );
    if (!target) {
      toast.error(`Usuário "${req.social_name}" não encontrado`);
      return;
    }
    setResetTarget({ id: target.id, name: target.social_name, requestId: req.id });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMut.mutate({
      fullName: String(fd.get("fullName") ?? "").trim(),
      socialName: String(fd.get("socialName") ?? "").trim(),
      password: String(fd.get("password") ?? ""),
      role: (fd.get("role") as "inventarista" | "gestor") ?? "inventarista",
    });
  };

  const handleReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetTarget) return;
    const fd = new FormData(e.currentTarget);
    await resetMut.mutateAsync({
      userId: resetTarget.id,
      password: String(fd.get("password") ?? ""),
    });
    if (resetTarget.requestId) {
      await supabase
        .from("password_reset_requests")
        .update({
          status: "approved",
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id ?? null,
        })
        .eq("id", resetTarget.requestId);
      qc.invalidateQueries({ queryKey: ["password-reset-requests"] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Usuários
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie inventaristas e gestores
          </p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="h-11 shadow-[var(--shadow-elevated)]">
              <Plus className="h-4 w-4 mr-2" /> Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar novo usuário</DialogTitle>
              <DialogDescription>
                Defina o login (nome social), senha inicial e perfil de acesso.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nu-name">Nome completo</Label>
                <Input id="nu-name" name="fullName" required minLength={3} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-social">Nome social (login)</Label>
                <Input
                  id="nu-social"
                  name="socialName"
                  required
                  minLength={2}
                  maxLength={60}
                  pattern="[a-zA-Z0-9_]+"
                  placeholder="ex: maria_silva"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-pass">Senha inicial</Label>
                <Input id="nu-pass" name="password" type="text" required minLength={6} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-role">Perfil de acesso</Label>
                <Select name="role" defaultValue="inventarista">
                  <SelectTrigger id="nu-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventarista">Inventarista</SelectItem>
                    <SelectItem value="gestor">Gestor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMut.isPending} className="w-full">
                  {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar usuário"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome social, nome ou e-mail"
            className="pl-9 h-11"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Login</TableHead>
                <TableHead>Nome completo</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Pontos</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum usuário
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => {
                  const isMe = u.id === user?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.social_name}
                        {isMe && <span className="text-xs text-primary ml-1">(você)</span>}
                      </TableCell>
                      <TableCell className="text-sm">{u.full_name}</TableCell>
                      <TableCell>
                        <Badge variant={u.is_gestor ? "default" : "secondary"}>
                          {u.is_gestor ? "Gestor" : "Inventarista"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{u.items_count}</TableCell>
                      <TableCell className="text-right font-mono">{u.points}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {u.last_sign_in_at
                          ? format(new Date(u.last_sign_in_at), "dd/MM HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Alterar perfil"
                            disabled={isMe || roleMut.isPending}
                            onClick={() =>
                              roleMut.mutate({
                                userId: u.id,
                                role: u.is_gestor ? "inventarista" : "gestor",
                              })
                            }
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Redefinir senha"
                            onClick={() =>
                              setResetTarget({ id: u.id, name: u.social_name })
                            }
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir usuário"
                                disabled={isMe}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir {u.social_name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação remove permanentemente o acesso do usuário.
                                  Os {u.items_count} registros de inventário serão mantidos
                                  para auditoria, mas ficarão sem dono visível.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMut.mutate(u.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha de {resetTarget?.name}</DialogTitle>
            <DialogDescription>
              Defina uma nova senha. Compartilhe com o usuário em segurança.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReset} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-pass">Nova senha</Label>
              <Input id="rp-pass" name="password" type="text" required minLength={6} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={resetMut.isPending} className="w-full">
                {resetMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redefinir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
