import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isPushSupported, subscribePush, unsubscribePush } from "@/lib/push";

export function EnablePushButton() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    setSupported(true);
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub && Notification.permission === "granted"))
      .catch(() => {});
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    setLoading(true);
    try {
      if (enabled) {
        await unsubscribePush();
        setEnabled(false);
        toast.info("Notificações desativadas");
      } else {
        await subscribePush();
        setEnabled(true);
        toast.success("Notificações ativadas! Você receberá lembretes às 07:20 e 13:20.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ativar notificações");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={enabled ? "secondary" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={loading}
      aria-label={enabled ? "Desativar notificações" : "Ativar notificações"}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : enabled ? (
        <BellOff className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
    </Button>
  );
}