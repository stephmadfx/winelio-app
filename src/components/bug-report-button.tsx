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
  const [hasUnread, setHasUnread] = useState(false);
  const [pendingReply, setPendingReply] = useState<PendingReply | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supabase Realtime — écoute les réponses du support
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
                  setHasUnread(false);
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

  async function handleOpen() {
    if (hasUnread && pendingReply) {
      setReplyOpen(true);
      setHasUnread(false);
      return;
    }
    setOpen(true);
    setCapturing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, {
        scale: 0.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
      setScreenshot(canvas.toDataURL("image/webp", 0.8));
    } catch {
      // Silencieux — l'utilisateur pourra uploader manuellement
    } finally {
      setCapturing(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setMessage("");
    setScreenshot(null);
    setScreenshotFile(null);
    setLoading(false);
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
        const res = await fetch(screenshot);
        const blob = await res.blob();
        formData.append(
          "screenshot",
          new File([blob], "screenshot.webp", { type: "image/webp" })
        );
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
        className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber shadow-lg shadow-winelio-orange/30 flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-transform lg:bottom-6"
        aria-label="Signaler un bug"
      >
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />
        )}
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01M5.07 5.07A9 9 0 1 0 18.93 18.93 9 9 0 0 0 5.07 5.07z"
          />
        </svg>
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
            {/* Screenshot preview */}
            <div className="relative rounded-lg overflow-hidden border border-black/10 bg-gray-50 h-36">
              {capturing && (
                <div className="absolute inset-0 flex items-center justify-center text-winelio-gray text-sm">
                  Capture en cours…
                </div>
              )}
              {!capturing && screenshot && (
                <img
                  src={screenshot}
                  alt="Screenshot"
                  className="w-full h-full object-cover object-top"
                />
              )}
              {!capturing && !screenshot && (
                <div className="absolute inset-0 flex items-center justify-center text-winelio-gray text-sm">
                  Pas de capture disponible
                </div>
              )}
            </div>

            {/* Remplacer screenshot */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-winelio-orange underline underline-offset-2"
            >
              Remplacer par mon propre screenshot
            </button>
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
