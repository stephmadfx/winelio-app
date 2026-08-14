import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyNewRecommendation } from "@/lib/notify-new-recommendation";

const SCHEMA = "winelio";

type Body = {
  selectedProId: string;
  description: string;
  urgency: "urgent" | "normal" | "flexible";
  selfForMe: boolean;
  selectedContactId?: unknown;
  createContact?: unknown;
  contactForm?: unknown;
  thirdPartyConsent?: unknown;
  selfProfile?: unknown;
};

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Session expirée — veuillez vous reconnecter" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const currentUserId = user.id;

  const containsThirdPartyPayload =
    body.selfForMe !== true ||
    body.selectedContactId != null ||
    body.createContact === true ||
    body.contactForm != null ||
    body.thirdPartyConsent === true ||
    body.selfProfile != null;

  if (containsThirdPartyPayload) {
    return NextResponse.json(
      { error: "Winelio n'accepte pas les coordonnées d'une personne tierce. La demande doit concerner le compte connecté." },
      { status: 400 },
    );
  }

  const { data: currentProfile, error: profileError } = await supabaseAdmin
    .schema(SCHEMA)
    .from("profiles")
    .select("first_name, last_name, phone, is_demo")
    .eq("id", currentUserId)
    .single();

  if (profileError || !currentProfile) {
    return NextResponse.json({ error: "Profil utilisateur introuvable" }, { status: 404 });
  }

  const accountEmail = user.email?.trim();
  if (!accountEmail) {
    return NextResponse.json({ error: "Adresse e-mail du compte introuvable" }, { status: 400 });
  }

  const selfContact = {
    first_name: currentProfile.first_name ?? "",
    last_name: currentProfile.last_name ?? "",
    email: accountEmail,
    phone: currentProfile.phone ?? "",
    user_id: currentUserId,
    country: "FR",
  };

  const { data: existingSelfContact, error: existingContactError } = await supabaseAdmin
    .schema(SCHEMA)
    .from("contacts")
    .select("id")
    .eq("user_id", currentUserId)
    .eq("email", accountEmail)
    .maybeSingle();

  if (existingContactError) {
    return NextResponse.json({ error: `Erreur lecture du demandeur: ${existingContactError.message}` }, { status: 500 });
  }

  let contactId = existingSelfContact?.id ?? null;
  if (contactId) {
    const { error: updateContactError } = await supabaseAdmin
      .schema(SCHEMA)
      .from("contacts")
      .update(selfContact)
      .eq("id", contactId)
      .eq("user_id", currentUserId);
    if (updateContactError) {
      return NextResponse.json({ error: `Erreur mise à jour du demandeur: ${updateContactError.message}` }, { status: 500 });
    }
  } else {
    const { data: newSelfContact, error: createContactError } = await supabaseAdmin
      .schema(SCHEMA)
      .from("contacts")
      .insert({ ...selfContact, address: "", city: "", postal_code: "" })
      .select("id")
      .single();
    if (createContactError) {
      return NextResponse.json({ error: `Erreur création du demandeur: ${createContactError.message}` }, { status: 500 });
    }
    contactId = newSelfContact.id;
  }

  if (!contactId || !body.selectedProId) {
    return NextResponse.json({ error: "Contact et professionnel requis" }, { status: 400 });
  }

  const { data: recommendation, error: recError } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .insert({
      referrer_id: currentUserId,
      professional_id: body.selectedProId,
      contact_id: contactId,
      project_description: body.description,
      urgency_level: body.urgency,
      status: "PENDING",
      is_demo: Boolean(currentProfile.is_demo),
    })
    .select("id")
    .single();

  if (recError) {
    return NextResponse.json({ error: `Erreur création recommandation: ${recError.message}` }, { status: 500 });
  }

  // ── Créer les recommendation_steps ─────────────────────────────────────────
  const { data: stepDefs } = await supabaseAdmin
    .schema(SCHEMA)
    .from("steps")
    .select("id, order_index")
    .order("order_index");

  if (stepDefs && stepDefs.length > 0) {
    const now = new Date().toISOString();
    const stepRows = stepDefs.map((s) => ({
      recommendation_id: recommendation.id,
      step_id: s.id,
      // Auto-compléter l'étape 1 "Recommandation reçue"
      completed_at: s.order_index === 1 ? now : null,
    }));

    const { error: stepsErr } = await supabaseAdmin
      .schema(SCHEMA)
      .from("recommendation_steps")
      .insert(stepRows);

    if (stepsErr) {
      console.error("[create-recommendation] erreur création steps:", stepsErr);
    }
  }

  notifyNewRecommendation(recommendation.id).catch((err) => {
    console.error("[create-recommendation] notify failed:", err);
  });

  return NextResponse.json({ recommendation });
}
