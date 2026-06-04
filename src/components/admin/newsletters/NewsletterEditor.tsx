"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Component, Editor } from "grapesjs";
import { useRouter } from "next/navigation";
import { Code, Download, Eye, Image as ImageIcon, Loader2, Mail, Monitor, Save, Sparkles, Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_NEWSLETTER_MJML, WINELIO_LOGO_COLOR_URL } from "@/lib/newsletter-defaults";
import type { NewsletterAudienceCategory, NewsletterEditorInitial, NewsletterTestEmailPreset } from "./newsletter-types";
import { NewsletterPreviewDialog } from "./NewsletterPreviewDialog";

type SaveResponse = {
  id: string;
  html: string;
  mjml: string;
  updatedAt: string;
  warnings?: string[];
  error?: string;
};

type NewsletterEditorProps = {
  initialTemplate: NewsletterEditorInitial;
  currentUserEmail: string;
  audienceCategories: NewsletterAudienceCategory[];
  testEmailPresets: NewsletterTestEmailPreset[];
};

type SelectedBlock = {
  kind: "none" | "text" | "button" | "image" | "layout" | "other";
  label: string;
  text: string;
  href: string;
  src: string;
  alt: string;
  backgroundColor: string;
  padding: string;
};

type AudienceFilters = {
  audienceType: "all" | "members" | "professionals" | "individuals";
  activeStatus: "active" | "inactive" | "all";
  companyVerified: "verified" | "unverified" | "all";
  hasSiret: "yes" | "no" | "all";
  categoryId: string;
  city: string;
  postalCodePrefix: string;
  workMode: string;
  founder: "yes" | "no" | "all";
  demo: "yes" | "no" | "all";
  createdFrom: string;
  createdTo: string;
  recommendationRole: "any" | "referrer" | "professional" | "none";
  recommendationStatus: string;
  commissionStatus: "EARNED" | "PENDING" | "any" | "none";
  withdrawalStatus: "PENDING" | "PROCESSING" | "PAID" | "REJECTED" | "any" | "none";
  search: string;
};

type AudienceRecipient = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isProfessional: boolean;
  isActive: boolean;
  city: string | null;
  postalCode: string | null;
  companyName: string | null;
  categoryName: string | null;
};

type AudiencePreview = {
  count: number;
  sample: AudienceRecipient[];
};

const variables = ["{{firstName}}", "{{lastName}}", "{{companyName}}", "{{unsubscribeUrl}}", "{{email}}", "{{date}}"];

const block = (label: string, content: string, category = "Winelio") => ({
  label,
  category,
  content,
});

const winelioBlocks = [
  block("Header logo", `<mj-section background-color="#FFFFFF" padding="24px 20px"><mj-column><mj-image src="${WINELIO_LOGO_COLOR_URL}" alt="Winelio" width="160px" /></mj-column></mj-section>`),
  block("Titre principal", `<mj-section background-color="#FFFFFF" padding="24px 40px 8px"><mj-column><mj-text align="center" font-size="28px" font-weight="800" line-height="1.25" color="#2D3436">Votre titre ici</mj-text></mj-column></mj-section>`),
  block("Texte simple", `<mj-section background-color="#FFFFFF" padding="8px 40px"><mj-column><mj-text color="#636E72" font-size="16px" line-height="1.7">Bonjour {{firstName}}, rédigez votre message ici.</mj-text></mj-column></mj-section>`),
  block("Bouton CTA", `<mj-section background-color="#FFFFFF" padding="20px 40px"><mj-column><mj-button href="https://winelio.app" background-color="#FF6B35" color="#FFFFFF" border-radius="10px" font-weight="700">Voir l'offre</mj-button></mj-column></mj-section>`),
  block("Image", `<mj-section background-color="#FFFFFF" padding="16px 40px"><mj-column><mj-image src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png" alt="Image newsletter" border-radius="12px" /></mj-column></mj-section>`),
  block("Offre promotion", `<mj-section background-color="#FFF5F0" padding="24px 36px" border-left="4px solid #FF6B35"><mj-column><mj-text font-size="20px" font-weight="800" color="#2D3436">Offre spéciale</mj-text><mj-text color="#636E72">Décrivez votre offre ou actualité Winelio.</mj-text><mj-button href="https://winelio.app" background-color="#F7931E">J'en profite</mj-button></mj-column></mj-section>`),
  block("Signature", `<mj-section background-color="#FFFFFF" padding="24px 40px"><mj-column><mj-text color="#636E72">À bientôt,<br /><strong>L'équipe Winelio</strong></mj-text></mj-column></mj-section>`),
  block("Footer légal", `<mj-section padding="24px 30px"><mj-column><mj-text align="center" color="#B2BAC0" font-size="12px" line-height="1.6">© 2026 {{companyName}}<br />Adresse de l'entreprise · Mentions légales<br /><a href="{{unsubscribeUrl}}" style="color:#FF6B35;">Se désinscrire</a></mj-text></mj-column></mj-section>`),
  block("Désinscription", `<mj-section padding="12px 30px"><mj-column><mj-text align="center" color="#B2BAC0" font-size="12px"><a href="{{unsubscribeUrl}}" style="color:#FF6B35;">Je ne souhaite plus recevoir ces emails</a></mj-text></mj-column></mj-section>`),
];

const emptySelectedBlock: SelectedBlock = {
  kind: "none",
  label: "",
  text: "",
  href: "",
  src: "",
  alt: "",
  backgroundColor: "",
  padding: "",
};

const defaultAudienceFilters: AudienceFilters = {
  audienceType: "all",
  activeStatus: "active",
  companyVerified: "all",
  hasSiret: "all",
  categoryId: "",
  city: "",
  postalCodePrefix: "",
  workMode: "",
  founder: "all",
  demo: "no",
  createdFrom: "",
  createdTo: "",
  recommendationRole: "any",
  recommendationStatus: "",
  commissionStatus: "any",
  withdrawalStatus: "any",
  search: "",
};

const recommendationStatuses = [
  "PENDING",
  "ACCEPTED",
  "CONTACT_MADE",
  "MEETING_SCHEDULED",
  "QUOTE_SUBMITTED",
  "QUOTE_VALIDATED",
  "PAYMENT_RECEIVED",
  "COMPLETED",
];

const splitEmails = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);

const mergeEmails = (current: string, nextEmail: string) => {
  const emails = [...new Set([...splitEmails(current), nextEmail].map((email) => email.toLowerCase()))];
  return emails.join(", ");
};

const getInitialAudienceFilters = (initialTemplate: NewsletterEditorInitial): AudienceFilters => {
  const projectData = initialTemplate?.projectData ?? {};
  const savedFilters = projectData.newsletterAudienceFilters;
  return savedFilters && typeof savedFilters === "object"
    ? { ...defaultAudienceFilters, ...(savedFilters as Partial<AudienceFilters>) }
    : defaultAudienceFilters;
};

export function NewsletterEditor({
  initialTemplate,
  currentUserEmail,
  audienceCategories,
  testEmailPresets,
}: NewsletterEditorProps) {
  const router = useRouter();
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blocksRef = useRef<HTMLDivElement | null>(null);
  const selectedComponentRef = useRef<Component | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [id, setId] = useState(initialTemplate?.id ?? null);
  const [name, setName] = useState(initialTemplate?.name ?? "Nouvelle newsletter");
  const [subject, setSubject] = useState(initialTemplate?.subject ?? "");
  const [preheader, setPreheader] = useState(initialTemplate?.preheader ?? "");
  const [status, setStatus] = useState("Initialisation de l'éditeur...");
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [previewHtml, setPreviewHtml] = useState(initialTemplate?.htmlContent ?? "");
  const [showHtml, setShowHtml] = useState(false);
  const [testEmails, setTestEmails] = useState(currentUserEmail);
  const [sendingTest, setSendingTest] = useState(false);
  const [audienceFilters, setAudienceFilters] = useState<AudienceFilters>(() => getInitialAudienceFilters(initialTemplate));
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreview>({ count: 0, sample: [] });
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceError, setAudienceError] = useState("");
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<SelectedBlock>(emptySelectedBlock);
  const [uploadingImage, setUploadingImage] = useState(false);

  const initialProjectData = useMemo(() => initialTemplate?.projectData ?? null, [initialTemplate]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setAudienceLoading(true);
      setAudienceError("");
      try {
        const res = await fetch("/api/newsletters/audience/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: audienceFilters }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Aperçu destinataires impossible");
        if (!cancelled) setAudiencePreview(data as AudiencePreview);
      } catch (err) {
        if (!cancelled) {
          setAudiencePreview({ count: 0, sample: [] });
          setAudienceError(err instanceof Error ? err.message : "Aperçu destinataires impossible");
        }
      } finally {
        if (!cancelled) setAudienceLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [audienceFilters]);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      if (!containerRef.current || editorRef.current) return;

      const [{ default: grapesjs }, { default: grapesjsMjml }] = await Promise.all([
        import("grapesjs"),
        import("grapesjs-mjml"),
      ]);

      if (!mounted || !containerRef.current) return;

      const editor = grapesjs.init({
        container: containerRef.current,
        height: "calc(100vh - 220px)",
        fromElement: false,
        storageManager: false,
        noticeOnUnload: false,
        plugins: [grapesjsMjml],
        assetManager: {
          uploadName: "file",
          uploadFile: async (event) => {
            const files = "dataTransfer" in event && event.dataTransfer
              ? event.dataTransfer.files
              : (event.target as HTMLInputElement).files;
            const file = files?.[0];
            if (!file) return;

            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/newsletters/upload-image", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload impossible");
            editor.AssetManager.add({ src: data.url });
          },
        },
      });

      editorRef.current = editor;
      winelioBlocks.forEach((item, index) => {
        editor.BlockManager.add(`winelio-${index}`, item);
      });
      if (blocksRef.current) {
        const blocksEl = editor.BlockManager.render(undefined, { external: true });
        if (blocksEl) blocksRef.current.replaceChildren(blocksEl);
      }

      const getComponentText = (component: Component) => {
        const content = component.get("content");
        if (typeof content === "string" && content.trim()) return content;

        const childText = component.components().models
          .map((child) => child.get("content") || child.toHTML())
          .join("");

        return childText.replace(/<\/?[^>]+(>|$)/g, "").trim();
      };

      const syncSelectedBlock = (component?: Component) => {
        const selected = component || editor.getSelected();
        if (!selected) {
          selectedComponentRef.current = null;
          setSelectedImageUrl("");
          setSelectedBlock(emptySelectedBlock);
          return;
        }

        const type = String(selected.get("type") || "").toLowerCase();
        const tagName = String(selected.get("tagName") || "").toLowerCase();
        const name = String(selected.get("name") || "").toLowerCase();
        const attrs = selected.getAttributes();
        const isImage = type === "mj-image" || tagName === "mj-image" || name === "image";
        const isButton = type === "mj-button" || tagName === "mj-button" || name === "button";
        const isText = type === "mj-text" || tagName === "mj-text" || name === "text";
        const isLayout = type === "mj-section" || tagName === "mj-section" || name === "section"
          || type === "mj-column" || tagName === "mj-column" || name === "column"
          || type === "mj-wrapper" || tagName === "mj-wrapper" || name === "wrapper"
          || type === "mj-spacer" || tagName === "mj-spacer" || name === "spacer"
          || type === "mj-divider" || tagName === "mj-divider" || name === "divider";
        const kind = isImage ? "image" : isButton ? "button" : isText ? "text" : isLayout ? "layout" : "other";

        selectedComponentRef.current = selected;
        setSelectedImageUrl(String(attrs.src || selected.get("src") || ""));
        setSelectedBlock({
          kind,
          label: String(selected.get("name") || selected.get("type") || "Bloc"),
          text: getComponentText(selected),
          href: String(attrs.href || ""),
          src: String(attrs.src || selected.get("src") || ""),
          alt: String(attrs.alt || ""),
          backgroundColor: String(attrs["background-color"] || ""),
          padding: String(attrs.padding || ""),
        });
      };

      editor.on("component:selected", syncSelectedBlock);
      editor.on("component:deselected", () => syncSelectedBlock());

      if (initialProjectData && Object.keys(initialProjectData).length > 0) {
        editor.loadProjectData(initialProjectData);
      } else {
        editor.setComponents(initialTemplate?.mjmlContent || DEFAULT_NEWSLETTER_MJML);
      }

      setStatus("Éditeur prêt");
    };

    setup().catch((err) => {
      setStatus(err instanceof Error ? err.message : "Erreur d'initialisation");
    });

    return () => {
      mounted = false;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [initialProjectData, initialTemplate?.mjmlContent]);

  const getMjmlContent = () => {
    const editor = editorRef.current;
    if (!editor) return initialTemplate?.mjmlContent || DEFAULT_NEWSLETTER_MJML;

    const mjml = editor.runCommand("mjml-code");
    return typeof mjml === "string" && mjml.trim()
      ? mjml
      : initialTemplate?.mjmlContent || DEFAULT_NEWSLETTER_MJML;
  };

  const compile = async () => {
    const res = await fetch("/api/newsletters/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mjmlContent: getMjmlContent(), subject, preheader }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Compilation impossible");
    setPreviewHtml(data.html);
    return data as SaveResponse;
  };

  const save = async () => {
    if (!editorRef.current) return;
    setSaving(true);
    setStatus("Sauvegarde en cours...");
    try {
      const res = await fetch("/api/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          subject,
          preheader,
          mjmlContent: getMjmlContent(),
          projectData: {
            ...editorRef.current.getProjectData(),
            newsletterAudienceFilters: audienceFilters,
          },
        }),
      });
      const data = (await res.json()) as SaveResponse;
      if (!res.ok) throw new Error(data.error || "Sauvegarde impossible");
      setId(data.id);
      setPreviewHtml(data.html);
      setStatus(`Sauvegardé à ${new Date(data.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
      if (!id) router.replace(`/gestion-reseau/newsletters/${data.id}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    try {
      await compile();
      setPreviewOpen(true);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Aperçu impossible");
    }
  };

  const exportFile = async (kind: "html" | "mjml" | "json") => {
    const compiled = kind === "html" ? await compile() : null;
    const content = kind === "html"
      ? compiled?.html || ""
      : kind === "mjml"
        ? getMjmlContent()
        : JSON.stringify(editorRef.current?.getProjectData() ?? {}, null, 2);
    const blob = new Blob([content], { type: kind === "json" ? "application/json" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "newsletter"}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateSelectedImage = (url: string) => {
    const selected = selectedComponentRef.current;
    if (!selected || !url.trim()) return;

    const nextUrl = url.trim();
    selected.addAttributes({ src: nextUrl });
    selected.set("src", nextUrl);
    setSelectedImageUrl(nextUrl);
    setStatus("Image mise à jour");
  };

  const updateSelectedText = (text: string) => {
    const selected = selectedComponentRef.current;
    if (!selected) return;

    selected.components(text);
    selected.set("content", text);
    setSelectedBlock((current) => ({ ...current, text }));
    setStatus("Texte mis à jour");
  };

  const updateSelectedHref = (href: string) => {
    const selected = selectedComponentRef.current;
    if (!selected) return;

    selected.addAttributes({ href: href.trim() });
    setSelectedBlock((current) => ({ ...current, href }));
    setStatus("Lien mis à jour");
  };

  const updateSelectedBackground = (backgroundColor: string) => {
    const selected = selectedComponentRef.current;
    if (!selected) return;

    selected.addAttributes({ "background-color": backgroundColor });
    setSelectedBlock((current) => ({ ...current, backgroundColor }));
    setStatus("Couleur mise à jour");
  };

  const updateSelectedPadding = (padding: string) => {
    const selected = selectedComponentRef.current;
    if (!selected) return;

    selected.addAttributes({ padding });
    setSelectedBlock((current) => ({ ...current, padding }));
    setStatus("Espacement mis à jour");
  };

  const updateSelectedAlt = (alt: string) => {
    const selected = selectedComponentRef.current;
    if (!selected) return;

    selected.addAttributes({ alt });
    setSelectedBlock((current) => ({ ...current, alt }));
    setStatus("Texte alternatif mis à jour");
  };

  const uploadSelectedImage = async (file: File) => {
    setUploadingImage(true);
    setStatus("Upload de l'image...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/newsletters/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload impossible");
      updateSelectedImage(data.url);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload impossible");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const updateAudienceFilter = <K extends keyof AudienceFilters>(key: K, value: AudienceFilters[K]) => {
    setAudienceFilters((current) => ({ ...current, [key]: value }));
  };

  const sendTest = async () => {
    const recipients = splitEmails(testEmails);
    if (recipients.length === 0) {
      setStatus("Ajoutez au moins un email de test");
      return;
    }

    setSendingTest(true);
    setStatus("Envoi du test...");
    try {
      const res = await fetch("/api/newsletters/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, to: recipients, subject, preheader, mjmlContent: getMjmlContent() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Envoi impossible");
      setStatus(`${recipients.length} email${recipients.length > 1 ? "s" : ""} de test envoyé${recipients.length > 1 ? "s" : ""}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="newsletter-studio space-y-5 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-orange-200/60 bg-[#2D3436] px-5 py-5 text-white shadow-[0_22px_70px_rgba(45,52,54,0.14)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_75%_15%,rgba(255,107,53,0.35),transparent_30%),radial-gradient(circle_at_90%_80%,rgba(247,147,30,0.22),transparent_34%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-100">
              <Sparkles className="size-3.5" />
              Studio newsletter
            </div>
            <h1 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">Éditeur newsletter</h1>
            <p className="mt-2 text-sm text-white/70">Créez, personnalisez, testez et ciblez vos campagnes Winelio dans un espace plus fluide.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => editorRef.current?.runCommand("core:undo")} title="Annuler">
              Annuler
            </Button>
            <Button type="button" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={preview}>
              <Eye /> Prévisualiser
            </Button>
            <Button type="button" className="bg-white text-winelio-dark hover:bg-orange-50" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Sauvegarder
            </Button>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border-orange-100/80 bg-white/90 py-0 shadow-[0_18px_45px_rgba(45,52,54,0.06)]">
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[0.8fr_1.2fr_1fr]">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Nom du template</span>
          <input className="h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-winelio-orange" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Sujet de l'email</span>
          <input className="h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-winelio-orange" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex : Les nouveautés Winelio du mois" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Preheader</span>
          <input className="h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-winelio-orange" value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Texte d'aperçu dans la boîte mail" />
        </label>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="newsletter-canvas-panel overflow-hidden rounded-2xl border border-orange-100/80 bg-white shadow-[0_22px_60px_rgba(45,52,54,0.08)]">
          <div ref={containerRef} className="newsletter-editor min-h-[620px]" />
        </div>
        <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <Card size="sm" className="newsletter-side-panel py-0">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="text-sm">Blocs à insérer</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            <div
              ref={blocksRef}
              className="newsletter-blocks max-h-[300px] overflow-auto rounded-xl border border-orange-100 bg-[#fffaf7] p-2"
            />
            </CardContent>
          </Card>
          <Card size="sm" className="newsletter-side-panel py-0">
            <CardHeader className="px-4 pt-4">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="size-4 text-winelio-orange" />
              <CardTitle className="text-sm">Bloc sélectionné</CardTitle>
            </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            {selectedBlock.kind !== "none" ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{selectedBlock.label}</p>

                {(selectedBlock.kind === "text" || selectedBlock.kind === "button") && (
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Texte</span>
                    <textarea
                      className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-winelio-orange"
                      value={selectedBlock.text}
                      onChange={(event) => updateSelectedText(event.target.value)}
                      onBlur={() => updateSelectedText(selectedBlock.text)}
                    />
                  </label>
                )}

                {selectedBlock.kind === "button" && (
                  <>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Lien du bouton</span>
                      <input
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                        value={selectedBlock.href}
                        onChange={(event) => updateSelectedHref(event.target.value)}
                        onBlur={() => updateSelectedHref(selectedBlock.href)}
                        placeholder="https://..."
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Couleur du bouton</span>
                      <input
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                        value={selectedBlock.backgroundColor}
                        onChange={(event) => {
                          setSelectedBlock((current) => ({ ...current, backgroundColor: event.target.value }));
                          updateSelectedBackground(event.target.value);
                        }}
                        placeholder="#FF6B35"
                      />
                    </label>
                  </>
                )}

                {selectedBlock.kind === "layout" && (
                  <>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Couleur de fond</span>
                      <input
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                        value={selectedBlock.backgroundColor}
                        onChange={(event) => updateSelectedBackground(event.target.value)}
                        placeholder="#FFFFFF"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Espacement</span>
                      <input
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                        value={selectedBlock.padding}
                        onChange={(event) => updateSelectedPadding(event.target.value)}
                        placeholder="24px 40px"
                      />
                    </label>
                  </>
                )}

                {selectedBlock.kind === "image" && (
                  <>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">URL publique R2</span>
                      <input
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                        value={selectedImageUrl}
                        onChange={(event) => {
                          setSelectedImageUrl(event.target.value);
                          updateSelectedImage(event.target.value);
                        }}
                        onBlur={() => updateSelectedImage(selectedImageUrl)}
                        placeholder="https://..."
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Texte alternatif</span>
                      <input
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                        value={selectedBlock.alt}
                        onChange={(event) => updateSelectedAlt(event.target.value)}
                        onBlur={() => updateSelectedAlt(selectedBlock.alt)}
                        placeholder="Description de l'image"
                      />
                    </label>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadSelectedImage(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? <Loader2 className="animate-spin" /> : <Upload />}
                      Importer sur R2
                    </Button>
                  </>
                )}

                {selectedBlock.kind === "other" && (
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez un texte, un bouton, une image ou une section pour afficher ses réglages rapides.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Cliquez sur un texte, un bouton, une image ou une section dans la newsletter pour modifier ses réglages ici.
              </p>
            )}
            </CardContent>
          </Card>
          <Card size="sm" className="newsletter-side-panel py-0">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="text-sm">Variables dynamiques</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {variables.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:border-winelio-orange hover:text-winelio-orange"
                  onClick={() => navigator.clipboard.writeText(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            </CardContent>
          </Card>
          <Card size="sm" className="newsletter-side-panel py-0">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="text-sm">Outils</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => editorRef.current?.setDevice("Desktop")}><Monitor /> Desktop</Button>
              <Button type="button" variant="outline" onClick={() => editorRef.current?.setDevice("Mobile portrait")}><Smartphone /> Mobile</Button>
              <Button type="button" variant="outline" onClick={() => setShowHtml((value) => !value)}><Code /> HTML</Button>
              <Button type="button" variant="outline" onClick={() => exportFile("html")}><Download /> HTML</Button>
              <Button type="button" variant="outline" onClick={() => exportFile("mjml")}>MJML</Button>
              <Button type="button" variant="outline" onClick={() => exportFile("json")}>JSON</Button>
            </div>
            </CardContent>
          </Card>
          <Card size="sm" className="newsletter-side-panel py-0">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="text-sm">Email de test</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            {testEmailPresets.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {testEmailPresets.map((preset) => (
                  <button
                    key={preset.email}
                    type="button"
                    className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:border-winelio-orange hover:text-winelio-orange"
                    onClick={() => setTestEmails((current) => mergeEmails(current, preset.email))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
            <textarea
              className="mb-2 min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-winelio-orange"
              value={testEmails}
              onChange={(e) => setTestEmails(e.target.value)}
              placeholder="email@exemple.fr, autre@exemple.fr"
            />
            <p className="mb-2 text-xs text-muted-foreground">
              Séparez plusieurs emails par une virgule, un espace ou un retour ligne.
            </p>
            <Button type="button" className="w-full" onClick={sendTest} disabled={sendingTest}>
              {sendingTest ? <Loader2 className="animate-spin" /> : <Mail />} Envoyer un test
            </Button>
            </CardContent>
          </Card>
          <p className="rounded-2xl border border-orange-100 bg-white/80 p-3 text-xs text-muted-foreground shadow-sm">
            <span className="mr-2 inline-block size-2 rounded-full bg-emerald-400 align-middle" />
            {status}
          </p>
        </aside>
      </div>

      <section className="newsletter-audience-panel overflow-hidden rounded-2xl border border-orange-100/80 bg-white shadow-[0_22px_60px_rgba(45,52,54,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-orange-100 bg-gradient-to-r from-[#fff7f1] via-white to-[#f6fbfb] p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-winelio-orange">Ciblage</p>
            <h2 className="mt-1 text-xl font-bold">Gestion des destinataires</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Construisez l'audience de la newsletter à partir des utilisateurs, professionnels, recommandations et transactions existants.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white bg-white px-5 py-3 text-right shadow-sm">
              <p className="text-3xl font-bold tracking-tight text-winelio-dark">
                {audienceLoading ? "..." : audiencePreview.count}
              </p>
              <p className="text-xs text-muted-foreground">
                personne{audiencePreview.count > 1 ? "s" : ""} ciblée{audiencePreview.count > 1 ? "s" : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAudienceFilters(defaultAudienceFilters)}
            >
              Réinitialiser
            </Button>
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-orange-100/80 bg-[#fffdfa] p-4">
              <p className="mb-3 text-sm font-semibold">Segment principal</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Audience</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.audienceType}
                    onChange={(event) => updateAudienceFilter("audienceType", event.target.value as AudienceFilters["audienceType"])}
                  >
                    <option value="all">Tous les utilisateurs</option>
                    <option value="members">Membres particuliers</option>
                    <option value="professionals">Professionnels</option>
                    <option value="individuals">Non professionnels</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Compte</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.activeStatus}
                    onChange={(event) => updateAudienceFilter("activeStatus", event.target.value as AudienceFilters["activeStatus"])}
                  >
                    <option value="active">Actifs</option>
                    <option value="inactive">Suspendus</option>
                    <option value="all">Tous</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Démo</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.demo}
                    onChange={(event) => updateAudienceFilter("demo", event.target.value as AudienceFilters["demo"])}
                  >
                    <option value="no">Hors démo</option>
                    <option value="yes">Démo</option>
                    <option value="all">Tous</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Fondateur</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.founder}
                    onChange={(event) => updateAudienceFilter("founder", event.target.value as AudienceFilters["founder"])}
                  >
                    <option value="all">Tous</option>
                    <option value="yes">Fondateurs</option>
                    <option value="no">Non fondateurs</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-orange-100/80 bg-white p-4">
              <p className="mb-3 text-sm font-semibold">Profil professionnel et zone</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Catégorie pro</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.categoryId}
                    onChange={(event) => updateAudienceFilter("categoryId", event.target.value)}
                  >
                    <option value="">Toutes les catégories</option>
                    {audienceCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Entreprise</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.companyVerified}
                    onChange={(event) => updateAudienceFilter("companyVerified", event.target.value as AudienceFilters["companyVerified"])}
                  >
                    <option value="all">Toutes</option>
                    <option value="verified">Vérifiées</option>
                    <option value="unverified">Non vérifiées</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">SIRET</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.hasSiret}
                    onChange={(event) => updateAudienceFilter("hasSiret", event.target.value as AudienceFilters["hasSiret"])}
                  >
                    <option value="all">Tous</option>
                    <option value="yes">Avec</option>
                    <option value="no">Sans</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Mode pro</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.workMode}
                    onChange={(event) => updateAudienceFilter("workMode", event.target.value)}
                  >
                    <option value="">Tous</option>
                    <option value="both">Mixte</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Ville</span>
                  <input
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.city}
                    onChange={(event) => updateAudienceFilter("city", event.target.value)}
                    placeholder="Lyon"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Code postal</span>
                  <input
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.postalCodePrefix}
                    onChange={(event) => updateAudienceFilter("postalCodePrefix", event.target.value)}
                    placeholder="69"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Inscrits après</span>
                  <input
                    type="date"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.createdFrom}
                    onChange={(event) => updateAudienceFilter("createdFrom", event.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Inscrits avant</span>
                  <input
                    type="date"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.createdTo}
                    onChange={(event) => updateAudienceFilter("createdTo", event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-orange-100/80 bg-white p-4">
              <p className="mb-3 text-sm font-semibold">Activité Winelio</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Reco</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.recommendationRole}
                    onChange={(event) => updateAudienceFilter("recommendationRole", event.target.value as AudienceFilters["recommendationRole"])}
                  >
                    <option value="any">Tous</option>
                    <option value="referrer">A recommandé</option>
                    <option value="professional">A reçu</option>
                    <option value="none">Aucune</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Statut reco</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.recommendationStatus}
                    onChange={(event) => updateAudienceFilter("recommendationStatus", event.target.value)}
                  >
                    <option value="">Tous</option>
                    {recommendationStatuses.map((statusValue) => (
                      <option key={statusValue} value={statusValue}>{statusValue}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Commission</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.commissionStatus}
                    onChange={(event) => updateAudienceFilter("commissionStatus", event.target.value as AudienceFilters["commissionStatus"])}
                  >
                    <option value="any">Toutes</option>
                    <option value="EARNED">Gagnée</option>
                    <option value="PENDING">En attente</option>
                    <option value="none">Aucune</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Retrait</span>
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.withdrawalStatus}
                    onChange={(event) => updateAudienceFilter("withdrawalStatus", event.target.value as AudienceFilters["withdrawalStatus"])}
                  >
                    <option value="any">Tous</option>
                    <option value="PENDING">En attente</option>
                    <option value="PROCESSING">En cours</option>
                    <option value="PAID">Payé</option>
                    <option value="REJECTED">Refusé</option>
                    <option value="none">Aucun</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Recherche</span>
                  <input
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-winelio-orange"
                    value={audienceFilters.search}
                    onChange={(event) => updateAudienceFilter("search", event.target.value)}
                    placeholder="Nom, email, entreprise..."
                  />
                </label>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-orange-100/80 bg-[#2D3436] p-4 text-white shadow-[0_18px_45px_rgba(45,52,54,0.12)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Aperçu</p>
                <p className="text-xs text-white/55">50 premiers destinataires</p>
              </div>
              {audienceLoading && <Loader2 className="size-4 animate-spin text-winelio-orange" />}
            </div>
            {audienceError && (
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{audienceError}</p>
            )}
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {audiencePreview.sample.length === 0 ? (
                <p className="rounded-xl border border-white/10 px-3 py-4 text-sm text-white/55">
                  Aucun destinataire dans l'aperçu.
                </p>
              ) : (
                audiencePreview.sample.map((recipient) => (
                  <div key={recipient.id} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 transition-colors hover:bg-white/[0.1]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">
                        {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || recipient.email}
                      </p>
                      <span className="shrink-0 rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
                        {recipient.isProfessional ? "Pro" : "Membre"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-white/55">{recipient.email}</p>
                    <p className="truncate text-xs text-white/45">
                      {[recipient.companyName, recipient.categoryName, recipient.city].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </section>

      {showHtml && (
        <textarea
          readOnly
          className="h-72 w-full rounded-xl border border-border bg-card p-4 font-mono text-xs"
          value={previewHtml || "Cliquez sur Prévisualiser ou Exporter HTML pour compiler le template."}
        />
      )}

      <NewsletterPreviewDialog
        open={previewOpen}
        html={previewHtml}
        subject={subject}
        preheader={preheader}
        mode={previewMode}
        onModeChange={setPreviewMode}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
