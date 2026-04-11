"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BugReport, PendingReply, formatDate } from "./types";
import { cleanReplyText } from "./text-utils";

interface ReplyDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pendingReplies: PendingReply[];
  replyIndex: number;
  setReplyIndex: (fn: (i: number) => number) => void;
  selectedReport: BugReport | null;
  setSelectedReport: (r: BugReport | null) => void;
  reports: BugReport[];
  onMarkAllSeen: () => void;
  onOpenHistory: () => void;
  onOpenLightbox: (url: string) => void;
}

export const ReplyDialog = ({
  open, onOpenChange, pendingReplies, replyIndex, setReplyIndex,
  selectedReport, setSelectedReport, reports, onMarkAllSeen, onOpenHistory, onOpenLightbox,
}: ReplyDialogProps) => {
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      if (!selectedReport) onMarkAllSeen();
      setSelectedReport(null);
    }
    onOpenChange(v);
  };

  const renderImages = (images: string[]) =>
    images.length > 0 && (
      <div className="space-y-2">
        {images.map((url, i) => (
          <button key={i} type="button" onClick={() => onOpenLightbox(url)} className="w-full block">
            <img src={url} alt={`Image ${i + 1}`} className="w-full rounded-lg border border-black/10 object-contain max-h-64 hover:opacity-90 transition-opacity cursor-zoom-in" />
          </button>
        ))}
      </div>
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><span>💬</span>Réponse du support</span>
            {!selectedReport && pendingReplies.length > 1 && (
              <span className="text-xs font-normal text-winelio-gray">{replyIndex + 1} / {pendingReplies.length}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {selectedReport?.admin_reply ? (
          <div className="space-y-4">
            <p className="text-xs text-winelio-gray">{selectedReport.page_url} · {formatDate(selectedReport.created_at)}</p>
            <div className="bg-gray-50 border border-black/10 rounded-lg p-4">
              <p className="text-sm text-winelio-dark leading-relaxed whitespace-pre-wrap">{cleanReplyText(selectedReport.admin_reply)}</p>
            </div>
            {renderImages(selectedReport.reply_images ?? [])}
            <p className="text-xs text-winelio-gray">Réf. bug #{selectedReport.id.substring(0, 8)}</p>
            <div className="flex justify-between items-center">
              <button type="button" onClick={() => { setSelectedReport(null); onOpenChange(false); onOpenHistory(); }}
                className="text-xs text-winelio-gray underline underline-offset-2">
                ← Retour à l&apos;historique
              </button>
              <Button variant="outline" size="sm" onClick={() => { setSelectedReport(null); onOpenChange(false); }}>Fermer</Button>
            </div>
          </div>
        ) : (() => {
          const current = pendingReplies[replyIndex];
          if (!current) return null;
          const currentImages = reports.find((r) => r.id === current.id)?.reply_images ?? [];
          return (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-black/10 rounded-lg p-4">
                <p className="text-sm text-winelio-dark leading-relaxed whitespace-pre-wrap">{current.reply}</p>
              </div>
              {renderImages(currentImages)}
              <p className="text-xs text-winelio-gray">Réf. bug #{current.id.substring(0, 8)}</p>
              <div className="flex items-center justify-between gap-2">
                {pendingReplies.length > 1 ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={replyIndex === 0} onClick={() => setReplyIndex((i) => i - 1)}>← Préc.</Button>
                    <Button variant="outline" size="sm" disabled={replyIndex === pendingReplies.length - 1} onClick={() => setReplyIndex((i) => i + 1)}>Suiv. →</Button>
                  </div>
                ) : <span />}
                <Button variant="outline" onClick={() => { onMarkAllSeen(); onOpenChange(false); }}>Fermer</Button>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
};
