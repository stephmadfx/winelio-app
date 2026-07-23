import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getProfessionalLeadAccessBlock,
  isFutureLeadBlocked,
} from "@/lib/professional-lead-access";
import { hasPaidProfessionalCommission } from "@/lib/recommendation-review";

// Statuts où le pro a accepté (ou plus loin dans le workflow)
// → le referrer peut voir l'identité complète du pro.
const ACCEPTED_OR_LATER = new Set([
  "ACCEPTED",
  "CONTACT_MADE",
  "MEETING_SCHEDULED",
  "QUOTE_SUBMITTED",
  "QUOTE_VALIDATED",
  "PAYMENT_RECEIVED",
  "COMPLETED",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;

  const { data: rec, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, status, amount, project_description, urgency_level, created_at, referrer_id, professional_id, abandoned_by_pro_at,
       contact:contacts(first_name, last_name, email, phone, address, city, postal_code),
       professional:profiles!recommendations_professional_id_fkey(first_name, last_name, company:companies(name)),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name)`
    )
    .eq("id", id)
    .single();

  if (error || !rec) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }

  // Access control: only referrer, professional, or super_admin can read
  const isReferrer = rec.referrer_id === user.id;
  const isPro = rec.professional_id === user.id;
  const isAdmin = user.app_metadata?.role === "super_admin";
  if (!isReferrer && !isPro && !isAdmin) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Tant que le pro n'a pas enregistré de carte bancaire, les coordonnées du
  // client sont masquées côté serveur (pas seulement dans l'UI).
  let contactMasked = false;

  if (isPro && !isAdmin) {
    const leadAccessBlock = await getProfessionalLeadAccessBlock(user.id);
    if (isFutureLeadBlocked(rec, leadAccessBlock)) {
      return NextResponse.json(
        {
          error:
            "Accès suspendu : réglez votre commission d'intermédiation Winelio en attente pour consulter les nouveaux leads.",
          leadAccessBlock,
        },
        { status: 403 }
      );
    }

    const { data: proProfile } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .select("stripe_payment_method_id")
      .eq("id", user.id)
      .single();

    if (!proProfile?.stripe_payment_method_id || rec.status === "PENDING") {
      contactMasked = true;
      const contactArr = Array.isArray(rec.contact) ? rec.contact : rec.contact ? [rec.contact] : [];
      const contact = contactArr[0] as { first_name?: string | null; last_name?: string | null; city?: string | null } | undefined;

      const f = contact?.first_name?.trim() || "";
      const l = contact?.last_name?.trim() || "";
      const c = contact?.city?.trim() || "";
      const fDisplay = f.length > 10 ? f.slice(0, 10) + "..." : f;
      let maskedName = fDisplay;
      if (fDisplay && l) {
        maskedName += ` ${l.charAt(0).toUpperCase()}.`;
      } else if (l) {
        maskedName = `${l.charAt(0).toUpperCase()}.`;
      }
      if (!maskedName) maskedName = "Contact";
      if (c) maskedName += ` (${c})`;

      rec.contact = {
        first_name: maskedName,
        last_name: null,
        email: null,
        phone: null,
        address: null,
        postal_code: null,
        city: contact?.city ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }
  }

  // Règle anti-court-circuit :
  // Tant que le pro n'a pas explicitement accepté, le referrer ne voit pas
  // son identité. L'ancien alias #XXXXXX n'est plus exposé.
  const shouldAnonymizePro = isReferrer && !isPro && !isAdmin && !ACCEPTED_OR_LATER.has(rec.status);
  if (shouldAnonymizePro) {
    rec.professional = {
      first_name: "Professionnel Winelio",
      last_name: null,
      company: { name: "Professionnel Winelio" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  const { data: recSteps } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .select(
      "id, step_id, completed_at, data, step:steps(name, description, completion_role, order_index)"
    )
    .eq("recommendation_id", id);

  const [{ data: review }, { data: referrerCommission }, professionalPaid] = await Promise.all([
    supabaseAdmin
      .schema("winelio")
      .from("reviews")
      .select("id, rating, comment, answers, status, created_at")
      .eq("recommendation_id", id)
      .eq("reviewer_id", rec.referrer_id)
      .maybeSingle(),
    supabaseAdmin
      .schema("winelio")
      .from("commission_transactions")
      .select("id, amount, status")
      .eq("recommendation_id", id)
      .eq("user_id", rec.referrer_id)
      .eq("type", "recommendation")
      .maybeSingle(),
    hasPaidProfessionalCommission(id),
  ]);

  return NextResponse.json({
    recommendation: rec,
    steps: recSteps ?? [],
    contactMasked,
    payout: {
      professional_paid: professionalPaid,
      review,
      referrer_commission: referrerCommission,
    },
  });
}
