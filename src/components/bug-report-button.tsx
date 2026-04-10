"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PendingReply {
  id: string;
  reply: string;
}

export function BugReportButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [pendingReply, setPendingReply] = useState<PendingReply | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vérifier au montage s'il y a des réponses non lues (en cas de rechargement)
  useEffect(() => {
    const supabase = createClient();
    const seenKey = `bug-replies-seen-${userId}`;
    const seen: string[] = JSON.parse(localStorage.getItem(seenKey) ?? "[]");

    supabase
      .schema("winelio")
      .from("bug_reports")
      .select("id, admin_reply")
      .eq("user_id", userId)
      .eq("status", "replied")
      .not("admin_reply", "is", null)
      .then(({ data }) => {
        if (!data) return;
        const unread = data.find((r) => !seen.includes(r.id) && r.admin_reply);
        if (unread) {
          const reply: PendingReply = { id: unread.id, reply: unread.admin_reply };
          setPendingReply(reply);
          setHasUnread(true);
        }
      });
  }, [userId]);

  // Supabase Realtime — écoute les réponses du support en temps réel
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bug-reports-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "winelio",
          table: "bug_reports",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            status: string;
            admin_reply: string;
          };
          if (row.status === "replied" && row.admin_reply) {
            const reply: PendingReply = { id: row.id, reply: row.admin_reply };
            setHasUnread(true);
            setPendingReply(reply);
            toast("Réponse du support Winelio", {
              description: row.admin_reply.substring(0, 120) + (row.admin_reply.length > 120 ? "…" : ""),
              duration: 10000,
              action: {
                label: "Voir",
                onClick: () => {
                  setPendingReply(reply);
                  setReplyOpen(true);
                  markReplySeen(reply.id);
                },
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  function markReplySeen(id: string) {
    const seenKey = `bug-replies-seen-${userId}`;
    const seen: string[] = JSON.parse(localStorage.getItem(seenKey) ?? "[]");
    if (!seen.includes(id)) localStorage.setItem(seenKey, JSON.stringify([...seen, id]));
    setHasUnread(false);
  }

  function handleOpen() {
    if (hasUnread && pendingReply) {
      setReplyOpen(true);
      markReplySeen(pendingReply.id);
      return;
    }
    setOpen(true);
  }

  async function handleCapture() {
    // Fermer la modal, attendre la fin de l'animation, capturer, réouvrir
    setOpen(false);
    setCapturing(true);
    setCaptureFailed(false);
    await new Promise((r) => setTimeout(r, 350));
    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(document.body, {
        quality: 0.92,
        pixelRatio: window.devicePixelRatio ?? 2,
        skipFonts: false,
        filter: (node) => !["IFRAME", "VIDEO"].includes(node.nodeName),
      });
      setScreenshot(dataUrl);
    } catch (err) {
      console.error("[BugReport] Capture failed:", err);
      setCaptureFailed(true);
    } finally {
      setCapturing(false);
      setOpen(true);
    }
  }

  function handleClose() {
    setOpen(false);
    setMessage("");
    setScreenshot(null);
    setScreenshotFile(null);
    setLoading(false);
    setCaptureFailed(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop lourde", { description: "Maximum 5 MB." });
      return;
    }
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshot(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!message.trim()) {
      toast.error("Décris le problème avant d'envoyer.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("message", message.trim());
      formData.append("pageUrl", window.location.pathname);

      if (screenshotFile) {
        formData.append("screenshot", screenshotFile);
      } else if (screenshot) {
        // Conversion data URL → Blob sans fetch (bloqué par CSP sur data URLs)
        const [header, b64] = screenshot.split(",");
        const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const ext = mime === "image/jpeg" ? "jpg" : "png";
        formData.append("screenshot", new File([blob], `screenshot.${ext}`, { type: mime }));
      }

      const response = await fetch("/api/bugs/report", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Erreur serveur");

      handleClose();
      toast.success("Signalement envoyé !", {
        description: "Notre équipe va analyser le problème. Vous recevrez une réponse ici.",
      });
    } catch {
      toast.error("Échec de l'envoi", {
        description: "Vérifie ta connexion et réessaie.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={handleOpen}
        className="fixed bottom-16 right-4 z-50 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber shadow-lg shadow-winelio-orange/30 flex items-center gap-1.5 px-3 h-8 text-white text-xs font-semibold hover:scale-105 active:scale-95 transition-transform lg:bottom-4"
        aria-label="Signaler un bug"
      >
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />
        )}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 5.07A9 9 0 1 0 18.93 18.93 9 9 0 0 0 5.07 5.07z" />
        </svg>
        <span>Signaler un bug</span>
      </button>

      {/* Modal signalement */}
      <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) handleClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-winelio-orange">🐛</span>
              Signaler un problème
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Screenshot */}
            {screenshot ? (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden border border-black/10 bg-gray-50 h-48">
                  <img
                    src={screenshot}
                    alt="Screenshot"
                    className="w-full h-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={handleCapture}
                    disabled={capturing}
                    className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs rounded px-2 py-1 flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 1 0 4.582 9" />
                    </svg>
                    Recapturer
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-winelio-orange underline underline-offset-2"
                >
                  Utiliser mon propre screenshot
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCapture}
                  disabled={capturing}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-winelio-orange/40 bg-orange-50 hover:bg-orange-100 text-winelio-orange text-sm font-medium h-20 transition-colors disabled:opacity-50"
                >
                  {capturing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Capture en cours…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 10.07 4h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 18.07 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                      </svg>
                      Capturer l'écran
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-black/15 bg-gray-50 hover:bg-gray-100 text-winelio-gray text-sm font-medium h-20 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 16M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                  </svg>
                  <span>Mon screenshot</span>
                  {captureFailed && (
                    <span className="text-xs text-amber-600 font-normal">Capture auto indisponible</span>
                  )}
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Décris le problème rencontré…"
              rows={4}
              className="w-full rounded-lg border border-black/10 bg-gray-50 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-winelio-orange/50"
            />

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || !message.trim()}
                className="bg-gradient-to-r from-winelio-orange to-winelio-amber text-white border-0"
              >
                {loading ? "Envoi…" : "Envoyer →"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog réponse support */}
      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>💬</span>
              Réponse du support
            </DialogTitle>
          </DialogHeader>
          {pendingReply && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-black/10 rounded-lg p-4">
                <p className="text-sm text-winelio-dark leading-relaxed whitespace-pre-wrap">
                  {pendingReply.reply}
                </p>
              </div>
              <p className="text-xs text-winelio-gray">
                Réf. bug #{pendingReply.id.substring(0, 8)}
              </p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setReplyOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
