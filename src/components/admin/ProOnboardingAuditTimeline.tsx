// src/components/admin/ProOnboardingAuditTimeline.tsx
"use client";

import { useState } from "react";
import { verifyDocumentIntegrity } from "@/app/gestion-reseau/utilisateurs/[id]/audit-actions";

export type OnboardingEvent = {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  document_id: string | null;
  document_version: string | null;
  document_hash: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const EVENT_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pro_activated:        { label: "Profil Pro activé",                  color: "text-emerald-400",  bg: "bg-emerald-500/10" },
  cgu_accepted:         { label: "CGU acceptées",                      color: "text-blue-400",     bg: "bg-blue-500/10" },
  engagement_accepted:  { label: "Engagement moral accepté",           color: "text-blue-400",     bg: "bg-blue-500/10" },
  siret_provided:       { label: "SIRET renseigné",                    color: "text-gray-300",     bg: "bg-white/5" },
  category_set:         { label: "Catégorie définie",                  color: "text-gray-300",     bg: "bg-white/5" },
  signature_completed:  { label: "Signature électronique complétée",   color: "text-violet-400",   bg: "bg-violet-500/10" },
};

function parseUserAgent(ua: string | null): string {
  if (!ua || ua === "unknown") return "Inconnu";
  const chrome = ua.match(/Chrome\/(\d+)/);
  const firefox = ua.match(/Firefox\/(\d+)/);
  const safari = chrome ? null : ua.match(/Version\/(\d+).*Safari/);
  const mac = /Mac OS X/.test(ua);
  const windows = /Windows NT/.test(ua);
  const os = mac ? "macOS" : windows ? "Windows" : "Linux";
  if (chrome) return `Chrome ${chrome[1]} / ${os}`;
  if (firefox) return `Firefox ${firefox[1]} / ${os}`;
  if (safari) return `Safari ${safari[1]} / ${os}`;
  return os;
}

function EventRow({ event }: { event: OnboardingEvent }) {
  const cfg = EVENT_CONFIG[event.event_type] ?? {
    label: event.event_type,
    color: "text-gray-300",
    bg: "bg-white/5",
  };
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<"unchanged" | "modified" | "not_found" | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!event.document_id || !event.document_hash) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await verifyDocumentIntegrity(event.document_id, event.document_hash);
      if (result.notFound) {
        setVerifyResult("not_found");
      } else {
        setVerifyResult(result.unchanged ? "unchanged" : "modified");
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Erreur lors de la vérification");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex gap-3 items-start">
      {/* Dot + ligne verticale */}
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${cfg.bg} border border-current ${cfg.color}`} />
      </div>
      {/* Contenu */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-xs text-gray-500">
            {new Date(event.created_at).toLocaleString("fr-FR")}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500 space-y-0.5">
          {event.ip_address && (
            <div>IP : <span className="text-gray-300 font-mono">{event.ip_address}</span></div>
          )}
          {event.user_agent && (
            <div>Agent : <span className="text-gray-300">{parseUserAgent(event.user_agent)}</span></div>
          )}
          {event.document_version && (
            <div>Document v{event.document_version}</div>
          )}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="font-mono text-gray-400">
              {Object.entries(event.metadata).map(([k, v]) => (
                <span key={k} className="mr-3">{k}: {String(v)}</span>
              ))}
            </div>
          )}
        </div>
        {event.document_hash && event.document_id && (
          <div className="mt-2">
            {verifyError ? (
              <span className="text-xs text-red-400">Erreur : {verifyError}</span>
            ) : verifyResult === null ? (
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="text-xs text-winelio-orange hover:underline disabled:opacity-50"
              >
                {verifying ? "Vérification…" : "Vérifier l'intégrité du document"}
              </button>
            ) : verifyResult === "unchanged" ? (
              <span className="text-xs text-emerald-400">✅ Document inchangé</span>
            ) : verifyResult === "not_found" ? (
              <span className="text-xs text-gray-400">Document introuvable (supprimé ?)</span>
            ) : (
              <span className="text-xs text-yellow-400">⚠️ Document modifié depuis l'acceptation</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProOnboardingAuditTimeline({ events }: { events: OnboardingEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-600 italic">Aucun événement d'onboarding enregistré.</p>
    );
  }

  return (
    <div>
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
