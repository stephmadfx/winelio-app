"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addFlowAnnotation, deleteFlowAnnotation } from "@/app/gestion-reseau/processus/actions";

export type FlowAnnotation = {
  id: string;
  node_id: string;
  content: string;
  created_at: string;
  author: { first_name: string | null; last_name: string | null } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeLabel: string;
  annotations: FlowAnnotation[];
  onAnnotationAdded: (annotation: FlowAnnotation) => void;
  onAnnotationDeleted: (annotationId: string) => void;
};

export function FlowAnnotationDialog({ open, onClose, nodeId, nodeLabel, annotations, onAnnotationAdded, onAnnotationDeleted }: Props) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!text.trim()) return;
    const content = text.trim();
    startTransition(async () => {
      await addFlowAnnotation(nodeId, content);
      onAnnotationAdded({
        id: crypto.randomUUID(),
        node_id: nodeId,
        content,
        created_at: new Date().toISOString(),
        author: null,
      });
      setText("");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteFlowAnnotation(id);
      onAnnotationDeleted(id);
    });
  }

  const nodeAnnotations = annotations.filter((a) => a.node_id === nodeId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-[#FF6B35] to-[#F7931E] px-5 py-4">
          <DialogHeader>
            <DialogTitle className="text-white text-[15px] font-bold">
              Note — {nodeLabel}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex gap-2 items-center">
            <span>🔵</span>
            <span>Nœud : <strong className="text-gray-700">{nodeLabel}</strong></span>
          </div>

          {nodeAnnotations.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                Notes existantes ({nodeAnnotations.length})
              </p>
              <div className="space-y-2">
                {nodeAnnotations.map((ann) => {
                  const authorName = [ann.author?.first_name, ann.author?.last_name]
                    .filter(Boolean).join(" ") || "Administrateur";
                  const date = new Date(ann.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "short", year: "numeric",
                  });
                  return (
                    <div key={ann.id} className="bg-[#FFFBF0] border-l-[3px] border-[#F7931E] rounded-r-lg px-3 py-2">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-[11px] text-gray-400">{authorName} · {date}</p>
                        <button
                          onClick={() => handleDelete(ann.id)}
                          disabled={isPending}
                          className="text-gray-300 hover:text-red-400 text-xs leading-none"
                          title="Supprimer cette note"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[13px] text-gray-700 mt-1">{ann.content}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
              Ajouter une note
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Votre note sur cette étape…"
              rows={3}
              maxLength={1000}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 resize-none outline-none focus:border-[#FF6B35] transition-colors"
            />
          </div>
        </div>

        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="bg-gray-100 text-gray-500 font-semibold text-[13px] px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !text.trim()}
            className="bg-gradient-to-br from-[#FF6B35] to-[#F7931E] text-white font-semibold text-[13px] px-4 py-2 rounded-lg disabled:opacity-50 transition-opacity"
          >
            {isPending ? "…" : "Enregistrer"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
