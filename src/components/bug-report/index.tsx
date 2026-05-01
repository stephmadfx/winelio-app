"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { BugReport, PendingReply } from "./types";
import { cleanReplyText } from "./text-utils";
import { ImageLightbox } from "./ImageLightbox";
import { ReplyDialog } from "./ReplyDialog";
import { HistoryDialog } from "./HistoryDialog";
import { ReportFormDialog } from "./ReportFormDialog";

interface BugReportButtonProps {
  userId: string;
  allBugReports?: BugReport[];
  variant?: "floating" | "inline";
}

export const BugReportButton = ({ userId, allBugReports = [], variant = "floating" }: BugReportButtonProps) => {
  const [formOpen, setFormOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [pendingReplies, setPendingReplies] = useState<PendingReply[]>([]);
  const [replyIndex, setReplyIndex] = useState(0);
  const [reports, setReports] = useState<BugReport[]>(allBugReports);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const seenKey = `bug-replies-seen-${userId}`;
  const getSeenIds = (): string[] => JSON.parse(localStorage.getItem(seenKey) ?? "[]");

  const markReplySeen = (id: string) => {
    const seen = getSeenIds();
    if (!seen.includes(id)) localStorage.setItem(seenKey, JSON.stringify([...seen, id]));
  };

  const markAllRepliesSeen = () => {
    pendingReplies.forEach((r) => markReplySeen(r.id));
    setHasUnread(false);
  };

  // Détection des réponses non lues au montage
  useEffect(() => {
    const seen = getSeenIds();
    const unread = allBugReports
      .filter((r) => r.status === "replied" && r.admin_reply && !seen.includes(r.id))
      .map((r) => ({ id: r.id, reply: cleanReplyText(r.admin_reply!) }));
    if (unread.length === 0) return;
    setPendingReplies(unread);
    setReplyIndex(0);
    setHasUnread(true);
  }, [userId, allBugReports]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const shouldOpenHistory = searchParams.get("bugHistory") === "1" || searchParams.get("openBugHistory") === "1";
    if (!shouldOpenHistory) return;

    setHistoryOpen(true);
    searchParams.delete("bugHistory");
    searchParams.delete("openBugHistory");
    const nextUrl = `${window.location.pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  // Supabase Realtime — nouvelles réponses du support en temps réel
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bug-reports-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "winelio", table: "bug_reports", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { id: string; status: string; admin_reply: string };
          if (row.status !== "replied" || !row.admin_reply) return;
          const reply: PendingReply = { id: row.id, reply: cleanReplyText(row.admin_reply) };
          setHasUnread(true);
          setPendingReplies((prev) => prev.find((r) => r.id === row.id) ? prev : [...prev, reply]);
          toast("Réponse du support Winelio", {
            description: reply.reply.substring(0, 120) + (reply.reply.length > 120 ? "…" : ""),
            duration: 10000,
            action: { label: "Voir", onClick: () => { setReplyOpen(true); markReplySeen(reply.id); } },
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const handleFloatingButtonClick = () => {
    if (hasUnread && pendingReplies.length > 0) { setReplyIndex(0); setReplyOpen(true); return; }
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/bugs/report?id=${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setReports((prev) => prev.filter((r) => r.id !== id));
      setPendingReplies((prev) => prev.filter((r) => r.id !== id));
      markReplySeen(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {variant === "inline" ? (
        <button onClick={handleFloatingButtonClick}
          className={`relative flex items-center gap-1 rounded-full px-2.5 py-1 min-h-7 text-white active:opacity-80 transition-all ${hasUnread ? "bg-gradient-to-br from-winelio-orange to-winelio-amber" : "bg-gradient-to-br from-violet-500 to-purple-500"}`}
          aria-label="Bugs et idées">
          {hasUnread && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />}
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 5.07A9 9 0 1 0 18.93 18.93 9 9 0 0 0 5.07 5.07z" />
          </svg>
          <span className="text-[10px] font-bold leading-tight text-center">Bugs<br />& idées</span>
        </button>
      ) : (
        <button onClick={handleFloatingButtonClick}
          data-tour="bug-button"
          className="fixed bottom-16 right-4 z-50 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber shadow-lg shadow-winelio-orange/30 hidden lg:flex items-center gap-1.5 px-3 h-8 text-white text-xs font-semibold hover:scale-105 active:scale-95 transition-transform lg:bottom-4"
          aria-label="Bugs et idées">
          {hasUnread && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 5.07A9 9 0 1 0 18.93 18.93 9 9 0 0 0 5.07 5.07z" />
          </svg>
          <span>Bugs & idées</span>
        </button>
      )}

      <ReportFormDialog
        open={formOpen}
        loading={false}
        historyCount={reports.length}
        onClose={() => setFormOpen(false)}
        onReopenForm={() => setFormOpen(true)}
        onOpenHistory={() => { setFormOpen(false); setHistoryOpen(true); }}
        onSubmitSuccess={() => setFormOpen(false)}
      />

      <ReplyDialog
        open={replyOpen}
        onOpenChange={setReplyOpen}
        pendingReplies={pendingReplies}
        replyIndex={replyIndex}
        setReplyIndex={setReplyIndex}
        selectedReport={selectedReport}
        setSelectedReport={setSelectedReport}
        reports={reports}
        onMarkAllSeen={markAllRepliesSeen}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenLightbox={setLightboxUrl}
      />

      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        reports={reports}
        deletingId={deletingId}
        onDelete={handleDelete}
        onNewReport={() => { setHistoryOpen(false); setFormOpen(true); }}
      />

      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  );
};
