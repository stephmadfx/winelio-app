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

interface BugReport {
  id: string;
  message: string;
  page_url: string;
  status: string;
  admin_reply: string | null;
  reply_images: string[] | null;
  created_at: string;
}

/**
 * Décode le quoted-printable en respectant l'encodage UTF-8.
 * String.fromCharCode() ne gère pas les séquences multi-octets (=C3=A9 → é).
 * On accumule les octets consécutifs et on les décode via TextDecoder.
 */
function decodeQP(s: string): string {
  s = s.replace(/=\r?\n/g, ""); // soft line breaks
  const parts: string[] = [];
  const bytes: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "=" && i + 2 < s.length && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      if (bytes.length) {
        parts.push(new TextDecoder("utf-8").decode(new Uint8Array(bytes)));
        bytes.length = 0;
      }
      parts.push(s[i]);
      i++;
    }
  }
  if (bytes.length) parts.push(new TextDecoder("utf-8").decode(new Uint8Array(bytes)));
  return parts.join("");
}

/** Décode le quoted-printable et nettoie les headers MIME résiduels dans admin_reply */
function cleanReplyText(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");
  text = decodeQP(text);
  // Si le texte commence par des headers MIME (Content-*), sauter jusqu'au contenu réel
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    const t = block.trim();
    if (/^Content-/m.test(t)) continue; // bloc de headers, ignorer
    // Filtrer citations et signatures
    const clean = t.split("\n")
      .filter(l => {
        const s = l.trim();
        return s && !s.startsWith(">") && !s.startsWith("--") &&
          !/^On .+wrote:/.test(s) && !/^Le .+ a écrit/.test(s) &&
          !/^-{2,}/.test(s);
      })
      .join("\n").trim();
    if (clean) return clean;
  }
  return raw.trim();
}

export function BugReportButton({ userId, allBugReports = [] }: { userId: string; allBugReports?: BugReport[] }) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [pendingReplies, setPendingReplies] = useState<PendingReply[]>([]);
  const [replyIndex, setReplyIndex] = useState(0);
  const [reports, setReports] = useState<BugReport[]>(allBugReports);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vérifier au montage s'il y a des réponses non lues (données passées par le serveur)
  useEffect(() => {
    const seenKey = `bug-replies-seen-${userId}`;
    const seen: string[] = JSON.parse(localStorage.getItem(seenKey) ?? "[]");
    const unread = allBugReports
      .filter((r) => r.status === "replied" && r.admin_reply && !seen.includes(r.id))
      .map((r) => ({ id: r.id, reply: cleanReplyText(r.admin_reply!) }));
    if (unread.length > 0) {
      setPendingReplies(unread);
      setReplyIndex(0);
      setHasUnread(true);
    }
  }, [userId, allBugReports]);

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
            const cleaned = cleanReplyText(row.admin_reply);
            const reply: PendingReply = { id: row.id, reply: cleaned };
            setHasUnread(true);
            setPendingReplies((prev) => {
              const already = prev.find((r) => r.id === row.id);
              return already ? prev : [...prev, reply];
            });
            toast("Réponse du support Winelio", {
              description: cleaned.substring(0, 120) + (cleaned.length > 120 ? "…" : ""),
              duration: 10000,
              action: {
                label: "Voir",
                onClick: () => {
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
  }

  function markAllRepliesSeen() {
    pendingReplies.forEach((r) => markReplySeen(r.id));
    setHasUnread(false);
  }

  function handleOpen() {
    if (hasUnread && pendingReplies.length > 0) {
      setReplyIndex(0);
      setReplyOpen(true);
      return;
    }
    setOpen(true);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/bugs/report?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== id));
        setPendingReplies((prev) => prev.filter((r) => r.id !== id));
        markReplySeen(id);
      }
    } finally {
      setDeletingId(null);
    }
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
            <div className="flex gap-2 justify-between">
              {reports.length > 0 ? (
                <button
                  type="button"
                  onClick={() => { setOpen(false); setHistoryOpen(true); }}
                  className="text-xs text-winelio-gray hover:text-winelio-orange underline underline-offset-2 transition-colors"
                >
                  Historique ({reports.length})
                </button>
              ) : <span />}
              <div className="flex gap-2">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog réponse support (notifications non lues OU depuis l'historique) */}
      <Dialog open={replyOpen} onOpenChange={(v) => {
        if (!v) { if (!selectedReport) markAllRepliesSeen(); setSelectedReport(null); }
        setReplyOpen(v);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span>💬</span>
                Réponse du support
              </span>
              {!selectedReport && pendingReplies.length > 1 && (
                <span className="text-xs font-normal text-winelio-gray">
                  {replyIndex + 1} / {pendingReplies.length}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            // Mode historique : afficher la réponse du rapport sélectionné
            if (selectedReport?.admin_reply) {
              const text = cleanReplyText(selectedReport.admin_reply);
              const images = selectedReport.reply_images ?? [];
              return (
                <div className="space-y-4">
                  <p className="text-xs text-winelio-gray">{selectedReport.page_url} · {formatDate(selectedReport.created_at)}</p>
                  <div className="bg-gray-50 border border-black/10 rounded-lg p-4">
                    <p className="text-sm text-winelio-dark leading-relaxed whitespace-pre-wrap">{text}</p>
                  </div>
                  {images.length > 0 && (
                    <div className="space-y-2">
                      {images.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Image ${i + 1}`} className="w-full rounded-lg border border-black/10 object-contain max-h-64" />
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-winelio-gray">Réf. bug #{selectedReport.id.substring(0, 8)}</p>
                  <div className="flex justify-between items-center">
                    <button type="button" onClick={() => { setSelectedReport(null); setReplyOpen(false); setHistoryOpen(true); }}
                      className="text-xs text-winelio-gray underline underline-offset-2">
                      ← Retour à l&apos;historique
                    </button>
                    <Button variant="outline" size="sm" onClick={() => { setSelectedReport(null); setReplyOpen(false); }}>Fermer</Button>
                  </div>
                </div>
              );
            }
            // Mode notifications non lues
            const current = pendingReplies[replyIndex];
            if (!current) return null;
            const currentFull = reports.find((r) => r.id === current.id);
            const currentImages = currentFull?.reply_images ?? [];
            return (
              <div className="space-y-4">
                <div className="bg-gray-50 border border-black/10 rounded-lg p-4">
                  <p className="text-sm text-winelio-dark leading-relaxed whitespace-pre-wrap">{current.reply}</p>
                </div>
                {currentImages.length > 0 && (
                  <div className="space-y-2">
                    {currentImages.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`Image ${i + 1}`} className="w-full rounded-lg border border-black/10 object-contain max-h-64" />
                      </a>
                    ))}
                  </div>
                )}
                <p className="text-xs text-winelio-gray">Réf. bug #{current.id.substring(0, 8)}</p>
                <div className="flex items-center justify-between gap-2">
                  {pendingReplies.length > 1 ? (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={replyIndex === 0}
                        onClick={() => setReplyIndex((i) => i - 1)}>← Préc.</Button>
                      <Button variant="outline" size="sm" disabled={replyIndex === pendingReplies.length - 1}
                        onClick={() => setReplyIndex((i) => i + 1)}>Suiv. →</Button>
                    </div>
                  ) : <span />}
                  <Button variant="outline" onClick={() => { markAllRepliesSeen(); setReplyOpen(false); }}>Fermer</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog historique */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>📋</span>
              Historique des signalements
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {reports.length === 0 ? (
              <p className="text-sm text-winelio-gray text-center py-8">Aucun signalement</p>
            ) : reports.map((report) => (
              <div key={report.id} className="border border-black/8 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    report.status === "replied"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {report.status === "replied" ? "Répondu" : "En attente"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-winelio-gray">{formatDate(report.created_at)}</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(report.id)}
                      disabled={deletingId === report.id}
                      className="text-winelio-gray hover:text-red-500 transition-colors disabled:opacity-40"
                      title="Supprimer"
                    >
                      {deletingId === report.id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-winelio-gray">{report.page_url}</p>
                <p className="text-sm text-winelio-dark line-clamp-2">{report.message}</p>
                {report.status === "replied" && report.admin_reply && (
                  <button
                    type="button"
                    onClick={() => { setSelectedReport(report); setHistoryOpen(false); setReplyOpen(true); }}
                    className="text-xs text-winelio-orange underline underline-offset-2 hover:text-winelio-amber transition-colors"
                  >
                    Voir la réponse →
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-black/8">
            <button
              type="button"
              onClick={() => { setHistoryOpen(false); setOpen(true); }}
              className="text-xs text-winelio-orange underline underline-offset-2"
            >
              + Nouveau signalement
            </button>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)}>Fermer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
