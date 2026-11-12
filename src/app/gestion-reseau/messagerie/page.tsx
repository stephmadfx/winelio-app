"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  uploadMessagingPhoto,
  type UploadedMessagingAttachment,
} from "@/components/messaging/image-upload-client";

type AdminChannel = {
  id: string;
  kind: "announcements" | "lineage" | "team";
  slug: string;
  name: string;
  description: string | null;
  allow_member_photos: boolean;
  is_archived: boolean;
  last_message_at: string | null;
  memberCount: number;
  messageCount: number;
};

type SuperAdminReviewer = {
  userId: string;
  email: string;
  displayName: string;
};

type AdminReport = {
  id: string;
  messageId: string;
  channelId: string;
  channelName: string;
  reason: string;
  details: string | null;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName?: string | null;
  resolutionNote?: string | null;
  reporterName: string;
  authorId: string | null;
  authorName: string;
  authorEmail: string | null;
  messageContent: string;
  hasAttachments: boolean;
  messageDeleted: boolean;
  moderationState?: string;
};

type AdminRestriction = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  channelName: string;
  restrictedUntil: string;
  reason: string | null;
  createdAt: string;
};

const REASON_LABELS: Record<string, string> = {
  non_compliant: "Non conforme à la charte",
  spam: "Spam / démarchage",
  personal_data: "Données personnelles client (RGPD)",
  inappropriate: "Propos inappropriés",
  misleading: "Information trompeuse",
  other: "Autre motif",
};

const DECISION_LABELS: Record<string, string> = {
  dismiss: "Classé conforme",
  mask_message: "Message masqué (avec trace)",
  delete_message: "Message supprimé (avec trace)",
};

export default function AdminMessagingPage() {
  const [loading, setLoading] = useState(true);
  const [groupsEnabled, setGroupsEnabled] = useState(false);
  const [superAdmins, setSuperAdmins] = useState<SuperAdminReviewer[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [restrictions, setRestrictions] = useState<AdminRestriction[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  // Formulaire de publication d'annonce officielle
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [photos, setPhotos] = useState<UploadedMessagingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/messaging", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        groupsEnabled?: boolean;
        superAdmins?: SuperAdminReviewer[];
        channels: AdminChannel[];
        reports: AdminReport[];
        restrictions: AdminRestriction[];
      };
      setGroupsEnabled(Boolean(data.groupsEnabled));
      setSuperAdmins(data.superAdmins ?? []);
      setChannels(data.channels ?? []);
      setReports(data.reports ?? []);
      setRestrictions(data.restrictions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const announcementsChannel = channels.find((c) => c.kind === "announcements") ?? null;
  const pendingReports = reports.filter((r) => r.status === "pending");
  const treatedReports = reports.filter((r) => r.status !== "pending").slice(0, 15);

  async function handleSyncAll() {
    setSyncing(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/admin/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_all" }),
      });
      const data = (await res.json().catch(() => ({}))) as { syncedCount?: number; error?: string };
      if (res.ok) {
        setStatusMsg(`Synchronisation terminée (${data.syncedCount ?? 0} membres actifs vérifiés).`);
        await loadData();
      } else {
        setStatusMsg(data.error || "Échec de la synchronisation.");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleTogglePhotos(ch: AdminChannel) {
    const nextVal = !ch.allow_member_photos;
    setChannels((prev) =>
      prev.map((c) => (c.id === ch.id ? { ...c, allow_member_photos: nextVal } : c)),
    );
    const res = await fetch("/api/admin/messaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_channel_photos",
        channelId: ch.id,
        allowMemberPhotos: nextVal,
      }),
    });
    if (!res.ok) {
      await loadData();
    }
  }

  async function handleResolveReport(
    reportId: string,
    decision: "dismiss" | "mask_message" | "delete_message",
    restrictDuration: "none" | "24h" | "7d" | "permanent" = "none",
  ) {
    const res = await fetch("/api/admin/messaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resolve_report",
        reportId,
        decision,
        restrictDuration,
      }),
    });
    if (res.ok) {
      setStatusMsg(
        decision === "dismiss"
          ? "Signalement classé conforme."
          : decision === "mask_message"
          ? "Message masqué avec trace visible dans le fil."
          : "Message supprimé avec trace visible dans le fil.",
      );
      await loadData();
    }
  }

  async function handleLiftRestriction(restrictionId: string) {
    const res = await fetch("/api/admin/messaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lift_restriction", restrictionId }),
    });
    if (res.ok) {
      setStatusMsg("Restriction levée.");
      await loadData();
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !announcementsChannel) return;
    setUploading(true);
    try {
      const uploaded = await uploadMessagingPhoto(announcementsChannel.id, file);
      setPhotos((prev) => [...prev, uploaded]);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Erreur d’upload photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handlePublishAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!announcementsChannel || publishing) return;
    if (!content.trim() && photos.length === 0) return;

    setPublishing(true);
    setStatusMsg("");
    try {
      const res = await fetch(
        `/api/messaging/channels/${announcementsChannel.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isOfficialAnnouncement: true,
            title: title.trim() || null,
            content: content.trim(),
            commentsEnabled,
            attachments: photos.map((p) => ({
              key: p.key,
              mime: p.mime,
              width: p.width,
              height: p.height,
            })),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatusMsg(data.error || "Publication impossible.");
        return;
      }
      setTitle("");
      setContent("");
      setPhotos([]);
      setStatusMsg("📢 Annonce officielle publiée dans Communauté Winelio.");
      await loadData();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Messagerie & Modération</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Annonces officielles, messages communautaires et étude des signalements par les {superAdmins.length || 3} Super Admins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSyncAll()}
            disabled={syncing}
            className="px-3.5 py-2 rounded-xl border border-border bg-card text-xs font-semibold hover:bg-muted transition disabled:opacity-50"
          >
            {syncing ? "Synchronisation…" : "↻ Synchroniser les membres"}
          </button>
          <Link
            href="/messages"
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-xs font-semibold shadow-sm"
          >
            Ouvrir la messagerie →
          </Link>
        </div>
      </div>

      {statusMsg && (
        <div
          role="status"
          className="rounded-2xl border border-winelio-orange/30 bg-orange-50/70 dark:bg-orange-950/20 px-4 py-3 text-sm text-foreground"
        >
          {statusMsg}
        </div>
      )}

      {/* Collège des 3 Super Admins */}
      {superAdmins.length > 0 && (
        <Card className="!rounded-2xl border-amber-200/70 bg-amber-50/30">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold uppercase tracking-wide text-winelio-orange">
                🛡️ Collège de modération Winelio ({superAdmins.length} Super Admins)
              </p>
              <p className="text-xs text-muted-foreground">
                Chaque signalement soumis par un membre ou un administrateur est visible et traitable ici par l’ensemble des Super Admins, avec journal d’audit.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {superAdmins.map((sa) => (
                <span
                  key={sa.userId}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-amber-200 text-xs font-semibold text-foreground"
                  title={sa.email}
                >
                  <span>👤 {sa.displayName}</span>
                  <span className="text-[11px] text-muted-foreground">({sa.email})</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="!rounded-2xl">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase font-semibold">
              Signalements à étudier
            </p>
            <p className="text-2xl font-bold mt-1 text-winelio-orange">{pendingReports.length}</p>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase font-semibold">
              Messages actifs
            </p>
            <p className="text-2xl font-bold mt-1">
              {channels.reduce((acc, c) => acc + c.messageCount, 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase font-semibold">
              Membres en lecture seule
            </p>
            <p className="text-2xl font-bold mt-1">{restrictions.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* File des signalements à étudier par les 3 Super Admins */}
      <Card className="!rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <h2 className="text-base font-bold">
            🚩 Signalements à étudier ({pendingReports.length})
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : pendingReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun signalement en attente d’étude.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingReports.map((rep) => (
                <div
                  key={rep.id}
                  className="rounded-2xl border border-border p-4 space-y-2.5 bg-background"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                        {REASON_LABELS[rep.reason] || rep.reason}
                      </span>
                      <span className="font-semibold">{rep.channelName}</span>
                      <span className="text-muted-foreground">
                        · Signalé par {rep.reporterName} le{" "}
                        {new Date(rep.createdAt).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      Auteur : <strong>{rep.authorName}</strong>
                      {rep.authorEmail ? ` (${rep.authorEmail})` : ""}
                    </span>
                  </div>

                  <p className="text-sm rounded-xl bg-muted/60 p-3 whitespace-pre-wrap break-words">
                    {rep.messageContent || (rep.hasAttachments ? "📷 [Photo partagée]" : "[Vide]")}
                  </p>
                  {rep.details && (
                    <p className="text-xs text-muted-foreground">
                      Précision du signalement : {rep.details}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleResolveReport(rep.id, "dismiss", "none")}
                      className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
                    >
                      ✅ Classer conforme
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveReport(rep.id, "mask_message", "none")}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                    >
                      🛡️ Masquer (laisser une trace)
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveReport(rep.id, "delete_message", "none")}
                      className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                    >
                      🗑️ Supprimer (laisser une trace)
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveReport(rep.id, "delete_message", "24h")}
                      className="px-3 py-1.5 rounded-xl bg-winelio-dark text-white text-xs font-semibold"
                    >
                      🚫 Supprimer + Lecture seule 24 h
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveReport(rep.id, "delete_message", "7d")}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                    >
                      🚫 Supprimer + Lecture seule 7 j
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publication d'une annonce officielle */}
      <Card className="!rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <h2 className="text-base font-bold">
            📢 Publier une annonce officielle dans Communauté Winelio
          </h2>
          <form onSubmit={(e) => void handlePublishAnnouncement(e)} className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de l’annonce (ex. Formation hebdomadaire ou réussite du réseau)"
              maxLength={140}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Contenu de l’annonce officielle visible sur le tableau de bord et la messagerie…"
              rows={4}
              maxLength={2000}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
            />
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <div key={p.key} className="relative">
                    <img
                      src={p.url}
                      alt="Illustration"
                      className="h-16 w-24 object-cover rounded-xl border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((x) => x.key !== p.key))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => void handlePhotoUpload(e)}
              className="hidden"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || !announcementsChannel}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  {uploading ? "Compression…" : "📷 Ajouter une photo"}
                </button>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={commentsEnabled}
                    onChange={(e) => setCommentsEnabled(e.target.checked)}
                    className="accent-winelio-orange"
                  />
                  Autoriser les réponses groupées sous l’annonce
                </label>
              </div>
              <button
                type="submit"
                disabled={publishing || (!content.trim() && photos.length === 0)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-xs font-semibold shadow-sm disabled:opacity-50"
              >
                {publishing ? "Publication…" : "📢 Publier l’annonce officielle"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Historique des signalements traités */}
      {treatedReports.length > 0 && (
        <Card className="!rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-base font-bold">
              📋 Historique des signalements examinés
            </h2>
            <div className="space-y-2">
              {treatedReports.map((rep) => (
                <div
                  key={rep.id}
                  className="rounded-xl border border-border px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-semibold">
                      {REASON_LABELS[rep.reason] || rep.reason}
                    </span>{" "}
                    · Auteur : <strong>{rep.authorName}</strong> · Signalé par {rep.reporterName}
                  </div>
                  <div className="text-muted-foreground">
                    <strong className="text-foreground">
                      {DECISION_LABELS[rep.resolutionNote || ""] ||
                        (rep.status === "dismissed" ? "Classé conforme" : "Traité")}
                    </strong>
                    {rep.resolvedByName ? ` par ${rep.resolvedByName}` : ""}
                    {rep.resolvedAt
                      ? ` le ${new Date(rep.resolvedAt).toLocaleString("fr-FR")}`
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Restrictions actives */}
      {restrictions.length > 0 && (
        <Card className="!rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-base font-bold">
              🔇 Membres en lecture seule (messagerie uniquement)
            </h2>
            <div className="space-y-2">
              {restrictions.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-semibold">{r.userName}</span>
                    {r.userEmail ? ` (${r.userEmail})` : ""} · {r.channelName} · jusqu’au{" "}
                    {new Date(r.restrictedUntil).getFullYear() > 3000
                      ? "illimité"
                      : new Date(r.restrictedUntil).toLocaleString("fr-FR")}
                    {r.reason ? ` — ${r.reason}` : ""}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLiftRestriction(r.id)}
                    className="px-3 py-1 rounded-lg border border-border font-medium hover:bg-muted"
                  >
                    Lever la restriction
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paramètres de l'espace actif */}
      <Card className="!rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Espace actif ({channels.length})</h2>
            {!groupsEnabled && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
                Salons Lignée & Équipe : en stand-by (non visibles)
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Espace
                  </th>
                  <th scope="col" className="py-2 px-3 font-semibold">
                    Type
                  </th>
                  <th scope="col" className="py-2 px-3 font-semibold">
                    Membres
                  </th>
                  <th scope="col" className="py-2 px-3 font-semibold">
                    Messages actifs
                  </th>
                  <th scope="col" className="py-2 pl-3 font-semibold">
                    Photos membres
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {channels.map((ch) => (
                  <tr key={ch.id}>
                    <td className="py-2.5 pr-3 font-medium">{ch.name}</td>
                    <td className="py-2.5 px-3">
                      {ch.kind === "announcements"
                        ? "Communauté nationale"
                        : ch.kind === "lineage"
                        ? "Lignée"
                        : "Équipe N1"}
                    </td>
                    <td className="py-2.5 px-3">{ch.memberCount}</td>
                    <td className="py-2.5 px-3">{ch.messageCount}</td>
                    <td className="py-2.5 pl-3">
                      <button
                        type="button"
                        onClick={() => void handleTogglePhotos(ch)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                          ch.allow_member_photos
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {ch.allow_member_photos ? "Autorisées" : "Super Admins seuls"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
