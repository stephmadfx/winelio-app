import { cookies } from "next/headers";
import { claimCookieName, hasClaimEmail, validClaimProof } from "@/lib/claim-access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/get-user";
import { formatDisplayName, formatMaskedProspectName } from "@/lib/utils";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WinelioLogo } from "@/components/winelio-logo";
import { AppBackground } from "@/components/AppBackground";
import { ClaimButton } from "./ClaimButton";

const URGENCY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  normal: "Normal",
  flexible: "Flexible",
};

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ recommendationId: string }>;
}) {
  const { recommendationId } = await params;

  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, project_description, urgency_level, created_at, professional_id,
       professional:profiles!recommendations_professional_id_fkey(id, email, companies(id, name, city, email, owner_id, source, deleted_at)),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name, sponsor_code),
       contact:contacts(first_name, last_name, city)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) {
    return (
      <div className="relative min-h-dvh bg-winelio-light">
        <AppBackground />
        <div className="relative z-10 flex min-h-dvh items-center justify-center p-6">
          <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-winelio-dark">Lien invalide</h1>
            <p className="mt-2 text-sm text-winelio-gray">
              Cette recommandation n&apos;existe plus ou le lien est cassé.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm font-semibold text-winelio-orange hover:underline"
            >
              Retour à Winelio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const normalize = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as T | null);

  const pro = normalize<{ id: string; email: string | null; companies: unknown }>(rec.professional);
  const company = (Array.isArray(pro?.companies) ? pro.companies : pro?.companies ? [pro.companies] : []).find((c: { deleted_at?: string | null }) => !c.deleted_at) as {
    id: string;
    name: string | null;
    city: string | null;
    email: string | null;
    owner_id: string | null;
    source: string | null;
  } | undefined;
  const referrer = normalize<{
    first_name: string | null;
    last_name: string | null;
    sponsor_code: string | null;
  }>(rec.referrer);
  const contact = normalize<{ first_name: string | null; last_name: string | null; city: string | null }>(rec.contact);

  const user = await getUser();

  // Si user connecté et déjà owner → direct vers la reco
  if (user && company?.owner_id === user.id && company.source === "owner") {
    redirect(`/recommendations/${recommendationId}`);
  }

  const claimDestination = `/claim/${recommendationId}`;
  const onboardingHref = `/profile/pro-onboarding?returnTo=${encodeURIComponent(claimDestination)}`;
  const canAccess = Boolean(user && (validClaimProof(recommendationId, (await cookies()).get(claimCookieName(recommendationId))?.value) || hasClaimEmail(user, [company?.email, pro?.email])));
  const { data: ownProfile } = user ? await supabaseAdmin.schema("winelio").from("profiles").select("is_professional, pro_engagement_accepted").eq("id", user.id).maybeSingle() : { data: null };
  const { data: ownCompanies } = user ? await supabaseAdmin.schema("winelio").from("companies").select("id, name, siret, insurance_number, source").eq("owner_id", user.id).is("deleted_at", null) : { data: [] };
  const readyCompanies = ownProfile?.is_professional && ownProfile?.pro_engagement_accepted
    ? (ownCompanies || []).filter(c => c.siret?.length === 14 && c.insurance_number && c.source !== "scraped") : [];

  const referrerName = formatDisplayName(referrer?.first_name, referrer?.last_name, "Un membre Winelio");
  const contactName = formatMaskedProspectName(
    contact?.first_name,
    contact?.last_name,
    contact?.city,
    "Un contact"
  );
  const urgencyLabel = URGENCY_LABELS[rec.urgency_level ?? ""] ?? "Normal";

  const alreadyClaimedByOther =
    company?.source === "owner" && company.owner_id !== user?.id;

  const sponsorCode = referrer?.sponsor_code ?? "";

  // Pré-remplir l'email du pro (priorité au mail company, fallback profile),
  // en ignorant les placeholders de seeding.
  const isPlaceholder = (e: string | null | undefined) =>
    !!e && /@(kiparlo-pro\.fr|winelio-scraped\.local|winko)/i.test(e);
  const prefillEmail = company?.email && !isPlaceholder(company.email)
    ? company?.email
    : pro?.email && !isPlaceholder(pro.email)
    ? pro?.email
    : null;

  const emailParam = prefillEmail ? `&email=${encodeURIComponent(prefillEmail)}` : "";
  const registerHref = `/auth/login?mode=register&ref=${encodeURIComponent(
    sponsorCode
  )}&returnTo=${encodeURIComponent(`/claim/${recommendationId}`)}${emailParam}`;
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(`/claim/${recommendationId}`)}${emailParam}`;

  return (
    <div className="relative min-h-dvh bg-winelio-light">
      <AppBackground />
      <div className="relative z-10 mx-auto max-w-xl px-4 py-12 sm:py-16">
        <div className="mb-8 flex justify-center">
          <WinelioLogo variant="color" height={44} />
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-lg sm:p-10">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber text-3xl">
            🤝
          </div>

          <h1 className="text-2xl font-black leading-tight text-winelio-dark sm:text-3xl">
            Un client veut travailler avec <span className="text-winelio-orange">{company?.name ?? "votre entreprise"}</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-winelio-gray">
            <strong className="text-winelio-dark">{referrerName}</strong> a recommandé votre
            entreprise à un contact via <strong className="text-winelio-orange">Winelio</strong>,
            la plateforme française de recommandations entre particuliers et professionnels.
          </p>

          <div className="mt-6 rounded-2xl border-l-4 border-winelio-orange bg-winelio-orange/5 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-winelio-dark">
              Projet
            </p>
            <p className="mt-1 text-sm leading-relaxed text-winelio-gray">
              {rec.project_description || "—"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-winelio-dark">
                  Contact
                </p>
                <p className="mt-0.5 text-winelio-gray">{contactName}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-winelio-dark">
                  Urgence
                </p>
                <p className="mt-0.5 text-winelio-gray">{urgencyLabel}</p>
              </div>
            </div>
          </div>

          {alreadyClaimedByOther ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Cette fiche a déjà été revendiquée par un autre utilisateur.
            </div>
          ) : user ? (
            <div className="mt-6">
              {!canAccess ? (
                <p role="alert" className="rounded-xl bg-orange-50 p-4 text-sm text-winelio-dark">Ouvrez le lien reçu par e-mail ou connectez-vous avec l’adresse qui a reçu cette recommandation. La récupération est réservée au professionnel destinataire.</p>
              ) : readyCompanies.length ? (
                <><ClaimButton recommendationId={recommendationId} companies={readyCompanies} /><p className="mt-3 text-xs text-winelio-gray">Votre parrain reste inchangé. Votre fiche sera utilisée pour les recommandations de cette entreprise.</p></>
              ) : (
                <><p className="mb-4 text-sm text-winelio-gray">Votre compte particulier est prêt. Créez ou complétez maintenant votre fiche professionnelle et validez vos engagements. Vous reviendrez ensuite ici pour récupérer votre recommandation.</p>
                  <Link href={onboardingHref} className="block rounded-2xl bg-winelio-orange py-4 text-center font-bold text-white">Créer ou compléter ma fiche professionnelle →</Link></>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {/* Bloc d'explication pour les pros qui ne connaissent pas Winelio */}
              <div className="rounded-2xl bg-winelio-light/60 border border-winelio-gray/10 p-4">
                <p className="text-sm font-bold text-winelio-dark mb-2 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-winelio-orange to-winelio-amber text-white text-xs">ⓘ</span>
                  Pour accéder à cette recommandation
                </p>
                <ul className="text-xs leading-5 text-winelio-gray space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-winelio-orange font-bold">1.</span>
                    <span>Inscrivez-vous gratuitement comme particulier, avec le code parrain prérempli.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-winelio-orange font-bold">2.</span>
                    <span>Depuis votre compte, créez votre fiche professionnelle et validez les informations et engagements demandés.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-winelio-orange font-bold">3.</span>
                    <span>Revenez récupérer votre recommandation, puis contactez le client.</span>
                  </li>
                </ul>
                <p className="mt-3 text-[11px] text-winelio-gray/80 leading-5">
                  Winelio est la plateforme française de recommandations entre particuliers et professionnels. L&apos;inscription est <strong className="text-winelio-dark">100&nbsp;% gratuite</strong> et sans engagement.
                </p>
              </div>

              <Link
                href={registerHref}
                className="block w-full rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber py-4 text-center text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:-translate-y-0.5"
              >
                Créer mon compte particulier →
              </Link>
              <p className="text-center text-xs text-winelio-gray">
                Déjà inscrit ?{" "}
                <Link
                  href={loginHref}
                  className="font-semibold text-winelio-orange hover:underline"
                >
                  Se connecter
                </Link>
              </p>
              {sponsorCode && (
                <p className="text-center text-[11px] text-winelio-gray/70">
                  Code parrain pré-rempli : <span className="font-mono font-bold text-winelio-dark">{sponsorCode}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-winelio-gray/60">
          © 2026 Winelio · Recommandez. Gagnez.
        </p>
      </div>
    </div>
  );
}
