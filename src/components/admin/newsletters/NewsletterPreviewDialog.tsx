"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type NewsletterPreviewDialogProps = {
  open: boolean;
  html: string;
  subject: string;
  preheader: string;
  mode: "desktop" | "mobile";
  onModeChange: (mode: "desktop" | "mobile") => void;
  onClose: () => void;
};

export function NewsletterPreviewDialog({
  open,
  html,
  subject,
  preheader,
  mode,
  onModeChange,
  onClose,
}: NewsletterPreviewDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{subject || "Sans sujet"}</p>
            <p className="truncate text-xs text-muted-foreground">{preheader || "Aucun preheader"}</p>
          </div>
          <div className="flex rounded-lg border border-border p-1">
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-xs ${mode === "desktop" ? "bg-winelio-orange text-white" : "text-muted-foreground"}`}
              onClick={() => onModeChange("desktop")}
            >
              Desktop
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-xs ${mode === "mobile" ? "bg-winelio-orange text-white" : "text-muted-foreground"}`}
              onClick={() => onModeChange("mobile")}
            >
              Mobile
            </button>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Fermer">
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-auto bg-[#F0F2F4] p-4">
          <iframe
            title="Aperçu newsletter"
            sandbox=""
            srcDoc={html}
            className={`mx-auto h-full min-h-[720px] rounded-lg bg-white shadow-sm ${mode === "mobile" ? "w-[390px] max-w-full" : "w-full max-w-[900px]"}`}
          />
        </div>
      </div>
    </div>
  );
}
