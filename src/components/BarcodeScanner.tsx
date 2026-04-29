import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onDetected: (code: string) => void;
}

export function BarcodeScanner({ onDetected }: Props) {
  const [open, setOpen] = useState(false);
  const containerId = "jassy-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const start = async () => {
      try {
        const scanner = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 140 } },
          (decoded) => {
            if (!active) return;
            active = false;
            onDetected(decoded);
            setOpen(false);
          },
          () => {},
        );
      } catch (err) {
        toast.error("Não foi possível acessar a câmera.");
        setOpen(false);
      }
    };
    start();
    return () => {
      active = false;
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {}).finally(() => {
          try { s.clear(); } catch { /* noop */ }
        });
        scannerRef.current = null;
      }
    };
  }, [open, onDetected]);

  return (
    <>
      <Button type="button" variant="outline" size="lg" className="h-12 w-12 shrink-0" onClick={() => setOpen(true)} aria-label="Escanear">
        <ScanLine className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between">
            <DialogTitle>Aponte para o código</DialogTitle>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </DialogHeader>
          <div id={containerId} className="w-full aspect-[4/3] bg-black" />
          <p className="text-xs text-muted-foreground text-center px-4 py-2">Posicione o código na área destacada</p>
        </DialogContent>
      </Dialog>
    </>
  );
}