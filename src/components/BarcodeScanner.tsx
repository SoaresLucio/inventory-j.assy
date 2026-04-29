import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine, X, Zap, ZapOff } from "lucide-react";
import { toast } from "sonner";
import { parseQrPayload, type ParsedQR } from "@/lib/qr-parse";

interface Props {
  /** Recebe o payload bruto (compatibilidade) */
  onDetected?: (code: string) => void;
  /** Recebe os 3 campos parseados (UC, item, lote) */
  onParsed?: (parsed: ParsedQR) => void;
}

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    o.start(); o.stop(ctx.currentTime + 0.21);
    setTimeout(() => ctx.close(), 400);
  } catch { /* noop */ }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(80);
}

export function BarcodeScanner({ onDetected, onParsed }: Props) {
  const [open, setOpen] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
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
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decoded) => {
            if (!active) return;
            if (onParsed) {
              const parsed = parseQrPayload(decoded);
              if (!parsed) {
                toast.error("Código Inválido — esperado UC(9) | Item(11) | Lote(10)");
                return; // segue escaneando
              }
              active = false;
              beep();
              onParsed(parsed);
              setOpen(false);
              return;
            }
            active = false;
            beep();
            onDetected?.(decoded);
            setOpen(false);
          },
          () => {},
        );
        // detecta suporte a torch
        try {
          const caps = scanner.getRunningTrackCameraCapabilities?.();
          // @ts-expect-error torch não está no tipo padrão
          if (caps?.torchFeature?.()?.isSupported?.()) setTorchSupported(true);
        } catch { /* noop */ }
      } catch {
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
      setTorchOn(false);
      setTorchSupported(false);
    };
  }, [open, onDetected, onParsed]);

  const toggleTorch = async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      const caps = s.getRunningTrackCameraCapabilities?.();
      // @ts-expect-error API experimental
      const torch = caps?.torchFeature?.();
      if (torch?.isSupported?.()) {
        await torch.apply(!torchOn);
        setTorchOn(!torchOn);
      } else {
        toast.info("Flash não suportado neste dispositivo");
      }
    } catch {
      toast.error("Não foi possível alternar o flash");
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="lg" className="h-12 w-12 shrink-0" onClick={() => setOpen(true)} aria-label="Escanear">
        <ScanLine className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between">
            <DialogTitle>Aponte para o QR Code</DialogTitle>
            <div className="flex items-center gap-1">
              {torchSupported && (
                <Button variant="ghost" size="sm" onClick={toggleTorch} aria-label="Flash">
                  {torchOn ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
          </DialogHeader>
          <div className="relative w-full aspect-square bg-black">
            <div id={containerId} className="absolute inset-0" />
            {/* Overlay de mira */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[260px] w-[260px]">
                <span className="absolute -top-px -left-px h-8 w-8 border-t-4 border-l-4 border-primary rounded-tl-md" />
                <span className="absolute -top-px -right-px h-8 w-8 border-t-4 border-r-4 border-primary rounded-tr-md" />
                <span className="absolute -bottom-px -left-px h-8 w-8 border-b-4 border-l-4 border-primary rounded-bl-md" />
                <span className="absolute -bottom-px -right-px h-8 w-8 border-b-4 border-r-4 border-primary rounded-br-md" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center px-4 py-2">
            Esperado: <span className="font-mono">UC(9) · Item(11) · Lote(10)</span>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}