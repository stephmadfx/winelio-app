"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, Mail, Plus, RefreshCw, Send, Trash2 } from "lucide-react";

type Newsletter = {
  id: string;
  subject: string;
  content: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  recipient_filters: { audience?: Audience; onlyActive?: boolean };
  selected_recipient_ids: string[];
  excluded_recipient_ids: string[];
  manual_emails: string[];
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  opened_count: number;
  clicked_count: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type Audience = "all" | "professionals" | "individuals" | "unreferencedProfessionals";

type Profile = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_professional: boolean | null;
  is_active: boolean | null;
};

type Stats = {
  recipients: {
    id: string;
    email: string;
    recipient_type: string;
    sent_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    failed_at: string | null;
    failure_reason: string | null;
    unsubscribed_at: string | null;
  }[];
  events: { event_type: string; url: string | null; created_at: string }[];
};

const emptyForm = {
  subject: "",
  content: "",
  audience: "all" as Audience,
  onlyActive: true,
  selectedRecipientIds: [] as string[],
  excludedRecipientIds: [] as string[],
  manualEmails: "",
};

export function NewsletterManager({
  initialNewsletters,
  profiles,
}: {
  initialNewsletters: Newsletter[];
  profiles: Profile[];
}) {
  const [newsletters, setNewsletters] = useState(initialNewsletters);
  const [selected, setSelected] = useState<Newsletter | null>(initialNewsletters[0] ?? null);
  const [form, setForm] = useState(() => fromNewsletter(initialNewsletters[0]));
  const [recipientCount, setRecipientCount] = useState(initialNewsletters[0]?.recipient_count ?? 0);
  const [message, setMessage] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [isPending, startTransition] = useTransition();

  const canEdit = !selected || selected.status === "draft" || selected.status === "failed";
  const previewHtml = useMemo(() => renderPreviewHtml(form.subject, form.content), [form.subject, form.content]);

  const refreshList = async () => {
    const response = await fetch("/api/admin/newsletters", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setNewsletters(data.newsletters);
  };

  const countRecipients = () => {
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/admin/newsletters/recipients-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      const data = await response.json();
      if (response.ok) {
        setRecipientCount(data.count);
        return;
      }
      setMessage(data.error ?? "Calcul impossible");
    });
  };

  const saveDraft = () => {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(selected ? `/api/admin/newsletters/${selected.id}` : "/api/admin/newsletters", {
        method: selected ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Sauvegarde impossible");
        return;
      }
      setSelected(data.newsletter);
      setForm(fromNewsletter(data.newsletter));
      setRecipientCount(data.newsletter.recipient_count);
      setMessage("Brouillon sauvegardé");
      await refreshList();
    });
  };

  const sendTest = () => {
    if (!selected) {
      setMessage("Sauvegardez le brouillon avant l'envoi test");
      return;
    }

    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/admin/newsletters/${selected.id}/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });
      const data = await response.json();
      setMessage(response.ok ? "Email de test envoyé" : data.error ?? "Envoi test impossible");
    });
  };

  const sendNow = () => {
    if (!selected || !confirm(`Envoyer cette newsletter à ${recipientCount} destinataire(s) ?`)) return;

    startTransition(async () => {
      setMessage("Envoi en cours...");
      const response = await fetch(`/api/admin/newsletters/${selected.id}/send`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Envoi impossible");
        return;
      }
      setMessage(`Envoi terminé : ${data.sent} envoyé(s), ${data.failed} échec(s)`);
      await refreshList();
    });
  };

  const deleteDraft = () => {
    if (!selected || !confirm("Supprimer ce brouillon ?")) return;

    startTransition(async () => {
      const response = await fetch(`/api/admin/newsletters/${selected.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Suppression impossible");
        return;
      }
      setSelected(null);
      setForm(emptyForm);
      setRecipientCount(0);
      await refreshList();
    });
  };

  const loadStats = (newsletter: Newsletter) => {
    setSelected(newsletter);
    setForm(fromNewsletter(newsletter));
    setRecipientCount(newsletter.recipient_count);
    startTransition(async () => {
      const response = await fetch(`/api/admin/newsletters/${newsletter.id}/stats`, { cache: "no-store" });
      const data = await response.json();
      setStats(response.ok ? { recipients: data.recipients, events: data.events } : null);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Newsletters</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Création, envoi et suivi des campagnes email Winelio</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setForm(emptyForm);
            setRecipientCount(0);
            setStats(null);
            setMessage("");
          }}
          className="inline-flex items-center gap-2 bg-winelio-orange hover:bg-winelio-amber text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle newsletter
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-winelio-orange/20 bg-orange-50 px-4 py-3 text-sm text-winelio-dark dark:bg-orange-950/20 dark:text-orange-100">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <aside className="space-y-3">
          {newsletters.map((newsletter) => (
            <button
              key={newsletter.id}
              type="button"
              onClick={() => loadStats(newsletter)}
              className={`w-full text-left bg-card rounded-xl border px-4 py-3 transition-colors ${
                selected?.id === newsletter.id ? "border-winelio-orange" : "border-border hover:border-winelio-orange/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{newsletter.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(newsletter.sent_at ?? newsletter.created_at)}</p>
                </div>
                <StatusBadge status={newsletter.status} />
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                <Metric value={newsletter.recipient_count} label="Dest." />
                <Metric value={newsletter.opened_count} label="Ouv." />
                <Metric value={newsletter.clicked_count} label="Clics" />
                <Metric value={newsletter.failed_count} label="Err." />
              </div>
            </button>
          ))}
          {newsletters.length === 0 && (
            <div className="bg-card rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Aucune newsletter pour le moment.
            </div>
          )}
        </aside>

        <section className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
          <div className="bg-card rounded-xl border border-border p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">{selected ? "Modifier la newsletter" : "Nouvelle newsletter"}</h2>
              <button
                type="button"
                onClick={countRecipients}
                className="inline-flex items-center gap-2 text-xs font-medium border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Recalculer
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Sujet</span>
              <input
                disabled={!canEdit}
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-winelio-orange/60 disabled:opacity-60"
                placeholder="Ex : Les nouveautés Winelio du mois"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Contenu</span>
              <textarea
                disabled={!canEdit}
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                rows={12}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm leading-6 focus:outline-none focus:border-winelio-orange/60 disabled:opacity-60"
                placeholder="Rédigez le contenu. Les URLs seront transformées en liens trackés."
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Audience</span>
                <select
                  disabled={!canEdit}
                  value={form.audience}
                  onChange={(event) => {
                    const audience = event.target.value as Audience;
                    setForm((current) => ({
                      ...current,
                      audience,
                      selectedRecipientIds: audience === "unreferencedProfessionals" ? [] : current.selectedRecipientIds,
                    }));
                  }}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-winelio-orange/60 disabled:opacity-60"
                >
                  <option value="all">Tous les utilisateurs</option>
                  <option value="professionals">Professionnels uniquement</option>
                  <option value="individuals">Particuliers uniquement</option>
                  <option value="unreferencedProfessionals">Pros non référencés</option>
                </select>
              </label>
              <label className="flex items-end gap-2 rounded-xl border border-border px-3 py-2">
                <input
                  disabled={!canEdit}
                  type="checkbox"
                  checked={form.onlyActive}
                  onChange={(event) => setForm((current) => ({ ...current, onlyActive: event.target.checked }))}
                  className="mb-1 accent-winelio-orange"
                />
                <span className="text-sm text-foreground">Utilisateurs actifs uniquement</span>
              </label>
            </div>

            {form.audience === "unreferencedProfessionals" && (
              <div className="rounded-xl border border-winelio-orange/25 bg-orange-50 px-4 py-3 text-sm text-winelio-dark dark:bg-orange-950/20 dark:text-orange-100">
                Cette audience utilise uniquement les emails des entreprises scrapées non revendiquées. Les comptes Winelio inscrits et les comptes démo restent exclus.
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Sélection manuelle</span>
              <select
                disabled={!canEdit}
                multiple
                value={form.selectedRecipientIds}
                onChange={(event) => setForm((current) => ({ ...current, selectedRecipientIds: selectedOptions(event.currentTarget) }))}
                className="w-full min-h-32 bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-winelio-orange/60 disabled:opacity-60"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileName(profile)} · {profile.email}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Si une sélection existe, elle remplace les filtres d’audience.</p>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Emails manuels</span>
              <textarea
                disabled={!canEdit}
                value={form.manualEmails}
                onChange={(event) => setForm((current) => ({ ...current, manualEmails: event.target.value }))}
                rows={3}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-winelio-orange/60 disabled:opacity-60"
                placeholder="email1@example.com, email2@example.com"
              />
            </label>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{recipientCount} destinataire(s)</p>
                <p className="text-xs text-muted-foreground">Calculé depuis les filtres et emails manuels</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  disabled={!canEdit || isPending}
                  onClick={saveDraft}
                  className="text-sm font-medium border border-border rounded-lg px-3 py-2 hover:bg-background transition-colors disabled:opacity-60"
                >
                  Sauvegarder
                </button>
                {selected && canEdit && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={deleteDraft}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 border border-red-500/20 rounded-lg px-3 py-2 hover:bg-red-500/10 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer
                  </button>
                )}
              </div>
            </div>

            {selected && (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <input
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                  className="bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-winelio-orange/60"
                  placeholder="Email de test"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={sendTest}
                  className="inline-flex items-center justify-center gap-2 text-sm font-medium border border-border rounded-xl px-4 py-2 hover:bg-muted transition-colors disabled:opacity-60"
                >
                  <Mail className="w-4 h-4" />
                  Test
                </button>
              </div>
            )}

            {selected && canEdit && (
              <button
                type="button"
                disabled={isPending || recipientCount === 0}
                onClick={sendNow}
                className="w-full inline-flex items-center justify-center gap-2 bg-winelio-orange hover:bg-winelio-amber text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                Envoyer maintenant
              </button>
            )}
          </div>

          <div className="space-y-5">
            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-4 h-4 text-winelio-orange" />
                <h2 className="text-base font-semibold text-foreground">Aperçu</h2>
              </div>
              <iframe
                title="Aperçu newsletter"
                srcDoc={previewHtml}
                className="w-full h-[560px] rounded-xl border border-border bg-white"
              />
            </div>

            {stats && (
              <div className="bg-card rounded-xl border border-border p-4 md:p-5">
                <h2 className="text-base font-semibold text-foreground mb-4">Rapport</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="text-left py-2 text-xs uppercase text-muted-foreground">Email</th>
                        <th className="text-left py-2 text-xs uppercase text-muted-foreground">Statut</th>
                        <th className="text-left py-2 text-xs uppercase text-muted-foreground">Ouvert</th>
                        <th className="text-left py-2 text-xs uppercase text-muted-foreground">Clic</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stats.recipients.map((recipient) => (
                        <tr key={recipient.id}>
                          <td className="py-2 pr-3 text-foreground">{recipient.email}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{recipient.failed_at ? "Échec" : recipient.sent_at ? "Envoyé" : "En attente"}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{recipient.opened_at ? formatDate(recipient.opened_at) : "—"}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{recipient.clicked_at ? formatDate(recipient.clicked_at) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const fromNewsletter = (newsletter?: Newsletter | null) => {
  if (!newsletter) return emptyForm;
  return {
    subject: newsletter.subject,
    content: newsletter.content,
    audience: newsletter.recipient_filters?.audience ?? "all",
    onlyActive: newsletter.recipient_filters?.onlyActive !== false,
    selectedRecipientIds: newsletter.selected_recipient_ids ?? [],
    excludedRecipientIds: newsletter.excluded_recipient_ids ?? [],
    manualEmails: (newsletter.manual_emails ?? []).join("\n"),
  };
};

const toPayload = (form: typeof emptyForm) => ({
  subject: form.subject,
  content: form.content,
  recipientFilters: { audience: form.audience, onlyActive: form.onlyActive },
  selectedRecipientIds: form.audience === "unreferencedProfessionals" ? [] : form.selectedRecipientIds,
  excludedRecipientIds: form.excludedRecipientIds,
  manualEmails: form.manualEmails,
});

const selectedOptions = (select: HTMLSelectElement) =>
  Array.from(select.selectedOptions).map((option) => option.value);

const profileName = (profile: Profile) =>
  `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
  (profile.is_professional ? "Professionnel" : "Utilisateur");

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const Metric = ({ value, label }: { value: number; label: string }) => (
  <div className="rounded-lg bg-muted/60 px-2 py-2">
    <p className="text-sm font-bold text-foreground">{value}</p>
    <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
  </div>
);

const StatusBadge = ({ status }: { status: Newsletter["status"] }) => {
  const label = {
    draft: "Brouillon",
    scheduled: "Planifiée",
    sending: "Envoi",
    sent: "Envoyée",
    failed: "Échec",
  }[status];
  const className = status === "sent"
    ? "bg-emerald-400/10 text-emerald-500 border-emerald-400/20"
    : status === "failed"
      ? "bg-red-400/10 text-red-500 border-red-400/20"
      : "bg-winelio-orange/10 text-winelio-orange border-winelio-orange/20";

  return <span className={`text-xs px-2.5 py-1 rounded-md font-medium border ${className}`}>{label}</span>;
};

const renderPreviewHtml = (subject: string, content: string) => {
  const safeSubject = escapeHtml(subject || "Sujet de la newsletter");
  const body = escapeHtml(content || "Votre contenu apparaîtra ici.")
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");

  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:28px 14px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
<tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
<tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:34px 38px;">
<p style="text-align:center;margin:0 0 24px;font-weight:800;color:#FF6B35;font-size:24px;">Winelio</p>
<h1 style="color:#2D3436;font-size:22px;line-height:1.3;text-align:center;margin:0 0 24px;">${safeSubject}</h1>
<div style="color:#2D3436;font-size:15px;line-height:1.7;">${body}</div>
<p style="border-top:1px solid #F0F2F4;margin:28px 0 0;padding-top:18px;text-align:center;"><a style="color:#8B949E;font-size:12px;">Se désinscrire des newsletters</a></p>
</td></tr>
<tr><td style="text-align:center;padding:16px 0;"><p style="color:#B2BAC0;font-size:11px;margin:0;">© 2026 Winelio</p><p style="color:#FF6B35;font-size:11px;margin:4px 0 0;">Recommandez. Connectez. Gagnez.</p></td></tr>
</table></td></tr></table></body></html>`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
