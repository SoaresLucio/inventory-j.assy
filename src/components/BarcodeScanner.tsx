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
  /** Estilo visual do botão de gatilho */
  variant?: "item" | "endereco" | "default";
  /** Texto auxiliar mostrado no rodapé do scanner */
  hintText?: string;
  /** Aria label do botão */
  label?: string;
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

export function BarcodeScanner({ onDetected, onParsed, variant = "default", hintText, label }: Props) {
  const [open, setOpen] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const containerId = "jassy-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const lastInvalidAtRef = useRef(0);
  const lastInvalidPayloadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    handledRef.current = false;
    setHint(null);
    let cancelled = false;

    const stopScanner = async () => {
      const s = scannerRef.current;
      if (!s) return;
      try {
        // só chama stop se estiver de fato rodando
        const state = (s as unknown as { getState?: () => number }).getState?.();
        // 2 = SCANNING (Html5QrcodeScannerState.SCANNING)
        if (state === 2) {
          await s.stop();
        }
      } catch { /* noop */ }
      try { s.clear(); } catch { /* noop */ }
      scannerRef.current = null;
    };

    const start = async () => {
      // 1) Verifica suporte
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        toast.error("Câmera não suportada neste navegador.");
        setOpen(false);
        return;
      }
      // 2) Solicita explicitamente a permissão de câmera (gera o prompt do SO)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        const name = (err as { name?: string })?.name ?? "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          toast.error("Permissão da câmera negada. Habilite nas configurações do navegador.", { duration: 6000 });
        } else if (name === "NotFoundError") {
          toast.error("Nenhuma câmera encontrada no dispositivo.");
        } else if (!window.isSecureContext) {
          toast.error("Câmera exige HTTPS. Use o app instalado ou domínio seguro.");
        } else {
          toast.error("Não foi possível acessar a câmera.");
        }
        setOpen(false);
        return;
      }

      if (cancelled) return;

      // 3) Inicia o scanner
      try {
        const scanner = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1,
          },
          (decoded) => {
            if (handledRef.current) return;
            const parsed = parseQrPayload(decoded);

            if (onParsed) {
              if (!parsed) {
                // throttle de feedback inválido (evita spam de toasts ao mirar)
                const now = Date.now();
                if (lastInvalidPayloadRef.current !== decoded || now - lastInvalidAtRef.current > 1500) {
                  lastInvalidPayloadRef.current = decoded;
                  lastInvalidAtRef.current = now;
                  setHint("Código inválido — esperado UC(9 díg) · Item(11 díg) · Lote");
                  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([30, 50, 30]);
                }
                return; // não fecha o scanner — deixa tentar de novo
              }
              handledRef.current = true;
              beep();
              setHint(null);
              // fecha primeiro a câmera para evitar callbacks duplicados,
              // depois entrega os dados parseados
              stopScanner().finally(() => {
                onParsed(parsed);
                setOpen(false);
              });
              return;
            }

            // Modo legacy: entrega payload bruto
            handledRef.current = true;
            beep();
            stopScanner().finally(() => {
              onDetected?.(decoded);
              setOpen(false);
            });
          },
          () => { /* erros por frame: ignorar */ },
        );

        // Tenta detectar suporte a flash/torch
        try {
          const caps = (scanner as unknown as { getRunningTrackCameraCapabilities?: () => { torchFeature?: () => { isSupported?: () => boolean } } }).getRunningTrackCameraCapabilities?.();
          if (caps?.torchFeature?.()?.isSupported?.()) setTorchSupported(true);
        } catch { /* noop */ }
      } catch {
        toast.error("Falha ao iniciar a câmera.");
        setOpen(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      stopScanner();
      setTorchOn(false);
      setTorchSupported(false);
    };
  }, [open, onDetected, onParsed]);

  const toggleTorch = async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      const caps = (s as unknown as { getRunningTrackCameraCapabilities?: () => { torchFeature?: () => { isSupported?: () => boolean; apply?: (v: boolean) => Promise<void> } } }).getRunningTrackCameraCapabilities?.();
      const torch = caps?.torchFeature?.();
      if (torch?.isSupported?.() && torch.apply) {
        await torch.apply(!torchOn);
        setTorchOn(!torchOn);
      } else {
        toast.info("Flash não suportado neste dispositivo");
      }
    } catch {
      toast.error("Não foi possível alternar o flash");
    }
  };

  const btnClass =
    variant === "item"
      ? "h-12 w-12 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 border-primary"
      : variant === "endereco"
        ? "h-12 w-12 shrink-0 bg-warning text-foreground hover:bg-warning/90 border-warning"
        : "h-12 w-12 shrink-0";

  return (
    <>
      <Button type="button" variant="outline" size="lg" className={btnClass} onClick={() => setOpen(true)} aria-label={label ?? "Escanear"}>
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
            {hint && (
              <div className="absolute inset-x-0 bottom-2 flex justify-center px-3">
                <div className="rounded-md bg-destructive/90 text-destructive-foreground text-xs font-medium px-3 py-1.5 shadow">
                  {hint}
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center px-4 py-2">
            {hintText ?? <>Esperado: <span className="font-mono">UC(9 díg) · Item(11 díg) · Lote (variável)</span></>}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
