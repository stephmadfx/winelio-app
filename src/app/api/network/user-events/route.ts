import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ACTIVE_STATUSES = [
  "PENDING", "ACCEPTED", "CONTACT_MADE", "MEETING_SCHEDULED",
  "QUOTE_SUBMITTED", "PAYMENT_RECEIVED",
];

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Recommandation reçue",
  ACCEPTED: "Acceptée",
  CONTACT_MADE: "Contact établi",
  MEETING_SCHEDULED: "Rendez-vous fixé",
  QUOTE_SUBMITTED: "Devis soumis",
  PAYMENT_RECEIVED: "Paiement reçu",
};

const STATUS_ORDER: Record<string, number> = {
  PENDING: 1,
  ACCEPTED: 2,
  CONTACT_MADE: 3,
  MEETING_SCHEDULED: 4,
  QUOTE_SUBMITTED: 5,
  PAYMENT_RECEIVED: 6,
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }

  // Contrôle anti-IDOR : userId doit appartenir au réseau de l'utilisateur connecté
  if (userId !== user.id && user.app_metadata?.role !== "super_admin") {
    const { data: networkIds } = await supabaseAdmin.rpc("get_network_ids", {
      p_user_id: user.id,
      p_max_depth: 5,
    });
    const validIds = new Set(
      (networkIds ?? []).map((r: { member_id: string }) => r.member_id)
    );
    if (!validIds.has(userId)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  // Récupère les recommandations en cours où la personne est le referrer OU le professionnel
  const { data: recos } = await supabaseAdmin
    .from("recommendations")
    .select(`
      id, status, amount, created_at, referrer_id, professional_id,
      contact:contacts(first_name, last_name),
      referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
      professional:profiles!recommendations_professional_id_fkey(
        first_name, last_name,
        companies!owner_id(alias, category:categories(name))
      )
    `)
    .or(`referrer_id.eq.${userId},professional_id.eq.${userId}`)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(20);

  type RecoRow = {
    id: string;
    status: string;
    amount: number | null;
    created_at: string;
    referrer_id: string;
    professional_id: string;
    contact: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null;
    referrer: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null;
    professional:
      | {
          first_name: string | null;
          last_name: string | null;
          companies:
            | { alias: string | null; category: { name: string } | Array<{ name: string }> | null }
            | Array<{ alias: string | null; category: { name: string } | Array<{ name: string }> | null }>
            | null;
        }
      | Array<{
          first_name: string | null;
          last_name: string | null;
          companies:
            | { alias: string | null; category: { name: string } | Array<{ name: string }> | null }
            | Array<{ alias: string | null; category: { name: string } | Array<{ name: string }> | null }>
            | null;
        }>
      | null;
  };

  const events = (recos ?? []).map((r: RecoRow) => {
    const contact = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    const referrer = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
    const professional = Array.isArray(r.professional) ? r.professional[0] : r.professional;
    const rawCompany = professional?.companies
      ? Array.isArray(professional.companies) ? professional.companies[0] : professional.companies
      : null;
    const rawCat = rawCompany?.category ?? null;
    const catName = Array.isArray(rawCat)
      ? (rawCat[0] as { name: string } | undefined)?.name ?? null
      : (rawCat as { name: string } | null)?.name ?? null;

    const role = r.referrer_id === userId ? "referrer" : "professional";
    const contactName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
      : null;
    const professionalName = rawCompany?.alias
      ?? (professional ? [professional.first_name, professional.last_name].filter(Boolean).join(" ") : null);
    const referrerName = referrer
      ? [referrer.first_name, referrer.last_name].filter(Boolean).join(" ")
      : null;

    return {
      id: r.id,
      status: r.status,
      step_order: STATUS_ORDER[r.status] ?? 0,
      step_label: STATUS_LABEL[r.status] ?? r.status,
      amount: r.amount ?? null,
      created_at: r.created_at,
      role,
      contact_name: contactName,
      professional_name: professionalName,
      professional_category: catName,
      referrer_name: referrerName,
    };
  });

  return NextResponse.json({ events });
}
