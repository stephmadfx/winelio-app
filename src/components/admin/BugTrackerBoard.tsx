"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createBugReportCard, deleteBugReport, updateBugReportBoard } from "@/app/gestion-reseau/actions";
import { useBugDeleteAccess } from "@/components/admin/bug-delete-access";

type Reporter = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type BugBoardReport = {
  id: string;
  message: string;
  page_url: string | null;
  status: string;
  admin_reply: string | null;
  reply_images: string[] | null;
  created_at: string;
  replied_at: string | null;
  tracking_status: string;
  ticket_type: string;
  priority: string;
  internal_note: string | null;
  updated_at: string | null;
  screenshot_url: string | null;
  screenshot_signed_url: string | null;
  reporter: Reporter | Reporter[] | null;
  source: string;
};

const BOARD_COLUMNS = [
  {
    id: "todo",
    label: "À faire",
    hint: "À qualifier ou planifier",
    tone: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  },
  {
    id: "in_progress",
    label: "En cours",
    hint: "Analyse ou correction active",
    tone: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  },
  {
    id: "blocked",
    label: "Bloqué",
    hint: "En attente d'un retour",
    tone: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  },
  {
    id: "done",
    label: "Terminé",
    hint: "Corrigé ou livré",
    tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  },
] as const;

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug",
  improvement: "Amélioration",
  site_change: "Modif site",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};

const QUICK_TARGETS = [
  { value: "todo", label: "À faire" },
  { value: "in_progress", label: "En cours" },
  { value: "blocked", label: "Bloqué" },
  { value: "done", label: "Terminé" },
] as const;

const CREATE_STATUS_OPTIONS = [
  { value: "todo", label: "À faire" },
  { value: "in_progress", label: "En cours" },
  { value: "blocked", label: "Bloqué" },
] as const;

const STATUS_CARD_STYLES: Record<string, string> = {
  todo: "border-amber-200/80 bg-amber-50/55 hover:border-amber-300/80",
  in_progress: "border-blue-200/80 bg-blue-50/55 hover:border-blue-300/80",
  blocked: "border-rose-200/80 bg-rose-50/55 hover:border-rose-300/80",
  done: "border-emerald-200/80 bg-emerald-50/55 hover:border-emerald-300/80",
};

function getReporterName(reporter: Reporter | Reporter[] | null) {
  const data = Array.isArray(reporter) ? reporter[0] : reporter;
  if (!data) return "Inconnu";
  return `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || data.email || "Inconnu";
}

function getReporterEmail(reporter: Reporter | Reporter[] | null) {
  const data = Array.isArray(reporter) ? reporter[0] : reporter;
  return data?.email ?? null;
}

function formatDate(iso: string | null) {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createDraft(report: BugBoardReport | null) {
  return {
    trackingStatus: report?.tracking_status ?? "todo",
    ticketType: report?.ticket_type ?? "bug",
    priority: report?.priority ?? "medium",
    internalNote: report?.internal_note ?? "",
  };
}

function createEmptyManualDraft() {
  return {
    message: "",
    pageUrl: "",
    trackingStatus: "todo",
    ticketType: "bug",
    priority: "medium",
    internalNote: "",
  };
}

export function BugTrackerBoard({ reports }: { reports: BugBoardReport[] }) {
  const router = useRouter();
  const canDelete = useBugDeleteAccess();
  const [bugReports, setBugReports] = useState(reports);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => createDraft(null));
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraftState, setCreateDraftState] = useState(() => createEmptyManualDraft());
  const [isPending, startTransition] = useTransition();
  const [sheetSide, setSheetSide] = useState<"right" | "bottom">("right");
  const [creating, setCreating] = useState(false);
  const createMessageRef = useRef<HTMLTextAreaElement>(null);

  const selectedReport = useMemo(
    () => bugReports.find((report) => report.id === selectedId) ?? null,
    [bugReports, selectedId]
  );

  useEffect(() => {
    setDraft(createDraft(selectedReport));
  }, [selectedReport]);

  useEffect(() => {
    setBugReports(reports);
  }, [reports]);

  useEffect(() => {
    if (selectedId && !bugReports.some((report) => report.id === selectedId)) {
      setSelectedId(null);
    }
  }, [bugReports, selectedId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const updateSheetSide = () => setSheetSide(mediaQuery.matches ? "bottom" : "right");

    updateSheetSide();
    mediaQuery.addEventListener("change", updateSheetSide);

    return () => mediaQuery.removeEventListener("change", updateSheetSide);
  }, []);

  const groupedReports = useMemo(() => {
    return BOARD_COLUMNS.reduce<Record<string, BugBoardReport[]>>((acc, column) => {
      acc[column.id] = bugReports.filter((report) => report.tracking_status === column.id);
      return acc;
    }, {});
  }, [bugReports]);

  const updateReport = (reportId: string, patch: Parameters<typeof updateBugReportBoard>[1]) => {
    startTransition(async () => {
      try {
        await updateBugReportBoard(reportId, patch);
        toast.success("Carte mise à jour");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Impossible de mettre à jour la carte");
      }
    });
  };

  const saveSelected = () => {
    if (!selectedReport) return;
    updateReport(selectedReport.id, {
      trackingStatus: draft.trackingStatus,
      ticketType: draft.ticketType,
      priority: draft.priority,
      internalNote: draft.internalNote,
    });
  };

  const resetCreateForm = () => setCreateDraftState(createEmptyManualDraft());

  const pasteIntoCreateMessage = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        toast.error("Le presse-papiers est vide.");
        return;
      }

      setCreateDraftState((prev) => ({ ...prev, message: clipboardText }));
      requestAnimationFrame(() => {
        createMessageRef.current?.focus();
        createMessageRef.current?.setSelectionRange(clipboardText.length, clipboardText.length);
      });
      toast.success("Texte collé");
    } catch {
      toast.error("Impossible d'accéder au presse-papiers. Utilise Ctrl/Cmd+V.");
    }
  };

  const createManualCard = () => {
    if (!createDraftState.message.trim()) {
      toast.error("Le message est requis pour créer une carte.");
      return;
    }

    setCreating(true);
    startTransition(async () => {
      try {
        const result = await createBugReportCard({
          message: createDraftState.message,
          pageUrl: createDraftState.pageUrl,
          trackingStatus: createDraftState.trackingStatus,
          ticketType: createDraftState.ticketType,
          priority: createDraftState.priority,
          internalNote: createDraftState.internalNote,
        });

        if (!result.ok) {
          toast.error(result.error || "Impossible de créer la carte");
          return;
        }

        setBugReports((prev) => [result.report, ...prev]);
        setSelectedId(result.report.id);
        setCreateOpen(false);
        resetCreateForm();
        toast.success("Carte créée");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Impossible de créer la carte");
      } finally {
        setCreating(false);
      }
    });
  };

  const removeReport = (report: BugBoardReport) => {
    const label = getReporterName(report.reporter);
    const confirmed = window.confirm(
      `Supprimer définitivement la carte de ${label} ? Cette action effacera aussi la capture associée.`
    );
    if (!confirmed) return;

    const previousReports = bugReports;
    setBugReports((prev) => prev.filter((item) => item.id !== report.id));
    if (selectedId === report.id) setSelectedId(null);

    startTransition(async () => {
      try {
        const result = await deleteBugReport(report.id);
        if (!result.ok) {
          setBugReports(previousReports);
          toast.error(result.error || "Impossible de supprimer la carte");
          return;
        }
        toast.success("Carte supprimée");
      } catch (err) {
        setBugReports(previousReports);
        toast.error(err instanceof Error ? err.message : "Impossible de supprimer la carte");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-card px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-foreground">Création rapide</p>
          <p className="text-xs text-muted-foreground">Ajoutez une carte manuellement sans passer par un signalement utilisateur.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-gradient-to-r from-winelio-orange to-winelio-amber text-white">
          Nouvelle carte
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((column) => {
          const count = groupedReports[column.id]?.length ?? 0;
          return (
            <div key={column.id} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{column.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{column.hint}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${column.tone}`}>
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {BOARD_COLUMNS.map((column) => (
          <section key={column.id} className="rounded-3xl border border-border bg-card/70 p-3 sm:p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{column.label}</h2>
                <p className="text-xs text-muted-foreground">{groupedReports[column.id]?.length ?? 0} ticket(s)</p>
              </div>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${column.tone}`}>
                {column.hint}
              </span>
            </div>

            <div className="space-y-3">
              {(groupedReports[column.id] ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                  Aucun ticket ici pour le moment.
                </div>
              ) : (
                groupedReports[column.id].map((report) => {
                  const reporterName = getReporterName(report.reporter);
                  const reporterEmail = getReporterEmail(report.reporter);
                  const cardOrigin = report.source === "manual" ? "Carte interne" : reporterName;
                  const isSelected = report.id === selectedId;
                  const statusTone = STATUS_CARD_STYLES[report.tracking_status] ?? "border-border bg-background hover:border-winelio-orange/40";
                  return (
                    <div key={report.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setSelectedId(report.id)}
                        className={`w-full rounded-2xl border p-3 pr-14 text-left transition-all sm:p-4 sm:pr-16 ${statusTone} ${
                          isSelected
                            ? "!border-winelio-orange !bg-orange-50/80 shadow-sm"
                            : "hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-foreground sm:text-sm">{cardOrigin}</p>
                            {report.source !== "manual" && reporterEmail && (
                              <p className="truncate text-[11px] text-muted-foreground sm:text-[11px]">{reporterEmail}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {report.source === "manual" && (
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                Interne
                              </span>
                            )}
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {report.status}
                            </span>
                          </div>
                        </div>

                        <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-foreground sm:mt-3 sm:line-clamp-3 sm:text-sm">
                          {report.message}
                        </p>

                        {report.screenshot_signed_url && (
                          <a
                            href={report.screenshot_signed_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block overflow-hidden rounded-xl border border-border bg-muted/30 sm:mt-3"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Capture jointe
                              </span>
                              <span className="rounded-full bg-winelio-orange/10 px-2 py-0.5 text-[10px] font-semibold text-winelio-orange">
                                Ouvrir
                              </span>
                            </div>
                            <img
                              src={report.screenshot_signed_url}
                              alt="Aperçu de la capture du bug"
                              className="h-24 w-full object-cover sm:h-28 sm:object-cover"
                            />
                          </a>
                        )}

                        <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3">
                          <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                            {TYPE_LABELS[report.ticket_type] ?? report.ticket_type}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                            {PRIORITY_LABELS[report.priority] ?? report.priority}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground sm:mt-3">
                          <span className="truncate">{report.page_url ?? "/"}</span>
                          <span className="hidden shrink-0 sm:inline">{formatDate(report.updated_at ?? report.created_at)}</span>
                        </div>

                        {report.internal_note && (
                          <p className="mt-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground sm:mt-3">
                            {report.internal_note}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3">
                          {QUICK_TARGETS.map((target) => (
                            <span
                              key={target.value}
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                                report.tracking_status === target.value
                                  ? "bg-winelio-orange text-white"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {target.label}
                            </span>
                          ))}
                        </div>
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeReport(report);
                          }}
                          disabled={isPending}
                          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 opacity-100 shadow-sm transition-opacity hover:bg-red-100 md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 disabled:opacity-50"
                          aria-label="Supprimer la carte"
                          title="Supprimer la carte"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>

      <Sheet open={Boolean(selectedReport)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={sheetSide}
          className="overflow-y-auto data-[side=bottom]:h-[88vh] data-[side=bottom]:w-full data-[side=bottom]:rounded-t-3xl data-[side=bottom]:border-t data-[side=bottom]:border-l-0 data-[side=right]:sm:max-w-xl pb-[env(safe-area-inset-bottom)]"
        >
          {selectedReport && (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
                <SheetTitle className="text-lg sm:text-xl">Suivi du ticket</SheetTitle>
                <SheetDescription>
                  {selectedReport.source === "manual"
                    ? "Carte interne créée manuellement"
                    : getReporterName(selectedReport.reporter)}
                  {selectedReport.source !== "manual" && getReporterEmail(selectedReport.reporter) ? ` · ${getReporterEmail(selectedReport.reporter)}` : ""}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-5">
                <div className={`space-y-3 rounded-2xl border p-4 ${STATUS_CARD_STYLES[selectedReport.tracking_status] ?? "border-border bg-muted/30"}`}>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-foreground">
                      Statut public: {selectedReport.status}
                    </span>
                    {selectedReport.source === "manual" && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        Carte interne
                      </span>
                    )}
                    <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-foreground">
                      {selectedReport.page_url ?? "/"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {selectedReport.message}
                  </p>
                </div>

                {selectedReport.screenshot_signed_url && (
                  <a
                    href={selectedReport.screenshot_signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-2xl border border-border"
                  >
                    <img
                      src={selectedReport.screenshot_signed_url}
                      alt="Capture du bug"
                      className="h-auto w-full object-cover"
                    />
                  </a>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1.5 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suivi</span>
                    <select
                      value={draft.trackingStatus}
                      onChange={(e) => setDraft((prev) => ({ ...prev, trackingStatus: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none sm:py-2"
                    >
                      {BOARD_COLUMNS.map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</span>
                    <select
                      value={draft.ticketType}
                      onChange={(e) => setDraft((prev) => ({ ...prev, ticketType: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none sm:py-2"
                    >
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priorité</span>
                    <select
                      value={draft.priority}
                      onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none sm:py-2"
                    >
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block space-y-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Suggestion de correction / note interne
                  </span>
                  <textarea
                    value={draft.internalNote}
                    onChange={(e) => setDraft((prev) => ({ ...prev, internalNote: e.target.value }))}
                    rows={5}
                    placeholder="Ex : corriger le filtre, ajouter un bouton, revoir le wording..."
                    className="w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none"
                  />
                </label>

                {selectedReport.admin_reply && (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reponse publiee</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{selectedReport.admin_reply}</p>
                  </div>
                )}

                <div className="rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                  Créé le {formatDate(selectedReport.created_at)}
                  {selectedReport.replied_at ? ` · Répondu le ${formatDate(selectedReport.replied_at)}` : ""}
                  {selectedReport.updated_at ? ` · Mis à jour le ${formatDate(selectedReport.updated_at)}` : ""}
                </div>
              </div>

              <div className="border-t border-border px-4 py-4 sm:px-6">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {QUICK_TARGETS.map((target) => (
                    <Button
                      key={target.value}
                      variant={draft.trackingStatus === target.value ? "default" : "outline"}
                      size="sm"
                      disabled={isPending}
                      onClick={() => setDraft((prev) => ({ ...prev, trackingStatus: target.value }))}
                      className="justify-center"
                    >
                      {target.label}
                    </Button>
                  ))}
                </div>
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Button variant="outline" onClick={() => setSelectedId(null)} disabled={isPending} className="w-full sm:w-auto">
                    Fermer
                  </Button>
                  <Button
                    onClick={saveSelected}
                    disabled={isPending}
                    className="w-full bg-gradient-to-r from-winelio-orange to-winelio-amber text-white sm:w-auto"
                  >
                    {isPending ? "Sauvegarde..." : "Enregistrer"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open && !creating) resetCreateForm();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Créer une carte manuelle</DialogTitle>
            <DialogDescription>
              Ajoutez une idée, un correctif ou une tâche interne directement dans le tableau.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</span>
                  <button
                    type="button"
                    onClick={pasteIntoCreateMessage}
                    className="text-[11px] font-semibold text-winelio-orange underline underline-offset-2 transition-colors hover:text-winelio-amber"
                  >
                    Coller
                  </button>
                </div>
                <textarea
                  ref={createMessageRef}
                  value={createDraftState.message}
                  onChange={(e) => setCreateDraftState((prev) => ({ ...prev, message: e.target.value }))}
                  rows={4}
                  placeholder="Décris le problème, l'idée ou la modification à planifier…"
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
                />
              </label>

              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page concernée</span>
                <input
                  value={createDraftState.pageUrl}
                  onChange={(e) => setCreateDraftState((prev) => ({ ...prev, pageUrl: e.target.value }))}
                  placeholder="/dashboard"
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
                />
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suivi</span>
                <select
                  value={createDraftState.trackingStatus}
                  onChange={(e) => setCreateDraftState((prev) => ({ ...prev, trackingStatus: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
                >
                  {CREATE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</span>
                <select
                  value={createDraftState.ticketType}
                  onChange={(e) => setCreateDraftState((prev) => ({ ...prev, ticketType: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priorité</span>
                <select
                  value={createDraftState.priority}
                  onChange={(e) => setCreateDraftState((prev) => ({ ...prev, priority: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
                >
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggestion de correction / note interne
                </span>
                <textarea
                  value={createDraftState.internalNote}
                  onChange={(e) => setCreateDraftState((prev) => ({ ...prev, internalNote: e.target.value }))}
                  rows={3}
                  placeholder="Optionnel: contexte, action à faire, lien vers une piste..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
                />
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating} className="w-full sm:w-auto">
                Annuler
              </Button>
              <Button
                onClick={createManualCard}
                disabled={creating || !createDraftState.message.trim()}
                className="w-full bg-gradient-to-r from-winelio-orange to-winelio-amber text-white sm:w-auto"
              >
                {creating ? "Création..." : "Créer la carte"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
