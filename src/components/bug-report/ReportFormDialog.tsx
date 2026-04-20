"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ReportFormDialogProps {
  open: boolean;
  loading: boolean;
  historyCount: number;
  onClose: () => void;
  onReopenForm: () => void;
  onOpenHistory: () => void;
  onSubmitSuccess: () => void;
}

export const ReportFormDialog = ({ open, loading, historyCount, onClose, onReopenForm, onOpenHistory, onSubmitSuccess }: ReportFormDialogProps) => {
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const reset = () => {
    setMessage("");
    setScreenshot(null);
    setScreenshotFile(null);
    setCaptureFailed(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleCapture = async () => {
    setCapturing(true);
    setCaptureFailed(false);
    // Laisser le spinner s'afficher avant de fermer le dialog
    await new Promise((r) => setTimeout(r, 150));
    onClose();
    // Attendre que l'animation de fermeture du dialog soit terminée
    await new Promise((r) => setTimeout(r, 300));
    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(document.body, {
        quality: 0.92,
        pixelRatio: window.devicePixelRatio ?? 2,
        skipFonts: false,
        filter: (node) => !["IFRAME", "VIDEO"].includes(node.nodeName),
      });
      setScreenshot(dataUrl);
    } catch {
      setCaptureFailed(true);
    } finally {
      setCapturing(false);
      onReopenForm();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image trop lourde", { description: "Maximum 5 MB." }); return; }
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshot(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePasteMessage = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("Le presse-papiers est vide.");
        return;
      }

      setMessage(text);
      requestAnimationFrame(() => {
        messageRef.current?.focus();
        messageRef.current?.setSelectionRange(text.length, text.length);
      });
      toast.success("Texte collé");
    } catch {
      toast.error("Impossible d'accéder au presse-papiers. Utilise Ctrl/Cmd+V.");
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) { toast.error("Décris le problème ou l'idée avant d'envoyer."); return; }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("message", message.trim());
      formData.append("pageUrl", window.location.pathname);
      if (screenshotFile) {
        formData.append("screenshot", screenshotFile);
      } else if (screenshot) {
        const [header, b64] = screenshot.split(",");
        const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        formData.append("screenshot", new File([blob], `screenshot.${mime === "image/jpeg" ? "jpg" : "png"}`, { type: mime }));
      }
      const res = await fetch("/api/bugs/report", { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      reset();
      onSubmitSuccess();
      toast.success("Signalement envoyé !", { description: "Notre équipe va analyser votre message. Vous recevrez une réponse ici." });
    } catch {
      toast.error("Échec de l'envoi", { description: "Vérifie ta connexion et réessaie." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span className="text-winelio-orange">🐛</span>Bugs & idées</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Décrivez un problème, un blocage, ou partagez une idée d'amélioration.
          </p>
        </DialogHeader>
        <div className="space-y-4">
          {screenshot ? (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden border border-black/10 bg-gray-50 h-48">
                <img src={screenshot} alt="Screenshot" className="w-full h-full object-contain" />
                <button type="button" onClick={handleCapture} disabled={capturing}
                  className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs rounded px-2 py-1 flex items-center gap-1 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 1 0 4.582 9" />
                  </svg>
                  Recapturer
                </button>
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-winelio-orange underline underline-offset-2">
                Utiliser mon propre screenshot
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={handleCapture} disabled={capturing}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-winelio-orange/40 bg-orange-50 hover:bg-orange-100 text-winelio-orange text-sm font-medium h-20 transition-colors disabled:opacity-50">
                {capturing ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Capture en cours…</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 10.07 4h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 18.07 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg>Capturer l&apos;écran</>
                )}
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-black/15 bg-gray-50 hover:bg-gray-100 text-winelio-gray text-sm font-medium h-20 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 16M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg>
                <span>Mon screenshot</span>
                {captureFailed && <span className="text-xs text-amber-600 font-normal">Capture auto indisponible</span>}
              </button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</span>
              <button
                type="button"
                onClick={handlePasteMessage}
                className="text-[11px] font-semibold text-winelio-orange underline underline-offset-2 transition-colors hover:text-winelio-amber"
              >
                Coller
              </button>
            </div>
            <textarea ref={messageRef} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Décris le problème, le blocage ou l'idée à proposer…" rows={4}
              className="w-full rounded-lg border border-black/10 bg-gray-50 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-winelio-orange/50" />
          <div className="flex gap-2 justify-between">
            {historyCount > 0 ? (
              <button type="button" onClick={() => { handleClose(); onOpenHistory(); }}
                className="text-xs text-winelio-gray hover:text-winelio-orange underline underline-offset-2 transition-colors">
                Historique ({historyCount})
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={submitting || loading}>Annuler</Button>
              <Button onClick={handleSubmit} disabled={submitting || !message.trim()}
                className="bg-gradient-to-r from-winelio-orange to-winelio-amber text-white border-0">
                {submitting ? "Envoi…" : "Envoyer →"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
