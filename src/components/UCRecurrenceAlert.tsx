import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, Hash, User, X, RefreshCw, MapPin } from "lucide-react";
import { format } from "date-fns";

export interface UCExisting {
  id: string;
  uc: string;
  item_code: string;
  lote: string;
  endereco: string;
  quantidade: number;
  created_at: string;
  user_social_name: string | null;
  user_full_name: string | null;
}

interface Props {
  loading: boolean;
  existing: UCExisting | null;
  onOverride: () => void;
  onCancel: () => void;
}

export function UCRecurrenceAlert({ loading, existing, onOverride, onCancel }: Props) {
  if (loading) {
    return (
      <Card className="p-4 border-warning/40 bg-warning/5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </Card>
    );
  }

  if (!existing) return null;

  return (
    <Card className="p-4 border-warning/50 bg-warning/10 space-y-3 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">UC já cadastrada</h3>
            <p className="text-xs text-muted-foreground font-mono">{existing.uc}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-1.5 text-xs">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Último registro:</span>
          <span className="font-medium">{format(new Date(existing.created_at), "dd/MM/yyyy HH:mm")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Quantidade salva:</span>
          <span className="font-mono font-semibold">{existing.quantidade}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Endereço:</span>
          <span className="font-mono">{existing.endereco}</span>
        </div>
        <div className="flex items-start gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">Inventariado por:</span>
            <span className="font-bold text-sm">{existing.user_full_name ?? existing.user_social_name ?? "—"}</span>
            {existing.user_social_name && existing.user_full_name && existing.user_social_name !== existing.user_full_name && (
              <span className="text-[11px] text-muted-foreground">login: {existing.user_social_name}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" className="flex-1" onClick={onOverride}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Recontar
        </Button>
      </div>
    </Card>
  );
}
