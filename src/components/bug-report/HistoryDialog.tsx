"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BugReport, formatDate } from "./types";

interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reports: BugReport[];
  deletingId: string | null;
  onDelete: (id: string) => void;
  onNewReport: () => void;
}

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
    status === "replied" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
  }`}>
    {status === "replied" ? "Répondu" : "En attente"}
  </span>
);

const DeleteButton = ({ id, deleting, onDelete }: { id: string; deleting: boolean; onDelete: () => void }) => (
  <button type="button" onClick={onDelete} disabled={deleting}
    className="text-winelio-gray hover:text-red-500 transition-colors disabled:opacity-40" title="Supprimer">
    {deleting ? (
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
);

export const HistoryDialog = ({ open, onOpenChange, reports, deletingId, onDelete, onNewReport }: HistoryDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><span>📋</span>Historique des signalements</DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {reports.length === 0 ? (
          <p className="text-sm text-winelio-gray text-center py-8">Aucun signalement</p>
        ) : reports.map((report) => (
          <div key={report.id} className="border border-black/8 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={report.status} />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-winelio-gray">{formatDate(report.created_at)}</span>
                <DeleteButton id={report.id} deleting={deletingId === report.id} onDelete={() => onDelete(report.id)} />
              </div>
            </div>
            <p className="text-xs text-winelio-gray">{report.page_url}</p>
            <p className="text-sm text-winelio-dark line-clamp-2">{report.message}</p>
            {report.status === "replied" && report.admin_reply && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Réponse reçue</p>
                <p className="mt-1 text-xs leading-5 text-emerald-900 line-clamp-3 whitespace-pre-wrap">
                  {report.admin_reply}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center pt-2 border-t border-black/8">
        <button type="button" onClick={onNewReport}
          className="text-xs text-winelio-orange underline underline-offset-2">
          + Nouveau signalement
        </button>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fermer</Button>
      </div>
    </DialogContent>
  </Dialog>
);
