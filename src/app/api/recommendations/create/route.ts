import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyNewRecommendation } from "@/lib/notify-new-recommendation";

const SCHEMA = "winelio";

const SELF_RECO_ERROR =
  "Une recommandation doit concerner quelqu'un d'autre. Le recommandé ne peut pas être le recommandeur.";

type ContactFormData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
};

type Body = {
  selectedContactId: string | null;
  selectedProId: string;
  description: string;
  urgency: "urgent" | "normal" | "flexible";
  selfForMe?: boolean;
  createContact: boolean;
  thirdPartyConsent: boolean;
  contactForm: ContactFormData | null;
};

const normalizeEmail = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Session expirée — veuillez vous reconnecter" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const currentUserId = user.id;
  const accountEmail = normalizeEmail(user.email);

  if (body.selfForMe === true) {
    return NextResponse.json({ error: SELF_RECO_ERROR }, { status: 400 });
  }

  if (body.thirdPartyConsent !== true) {
    return NextResponse.json(
      { error: "Le consentement explicite du recommandé est obligatoire" },
      { status: 400 },
    );
  }

  if (!body.selectedProId) {
    return NextResponse.json({ error: "Professionnel requis" }, { status: 400 });
  }

  if (body.selectedProId === currentUserId) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas vous recommander vous-même en tant que professionnel" },
      { status: 400 },
    );
  }

  const { data: currentProfile, error: profileError } = await supabaseAdmin
    .schema(SCHEMA)
    .from("profiles")
    .select("is_demo")
    .eq("id", currentUserId)
    .single();

  if (profileError || !currentProfile) {
    return NextResponse.json({ error: "Profil utilisateur introuvable" }, { status: 404 });
  }

  let contactId = typeof body.selectedContactId === "string" ? body.selectedContactId : null;

  if (body.createContact && body.contactForm) {
    const formEmail = normalizeEmail(body.contactForm.email);
    if (!formEmail || formEmail === accountEmail) {
      return NextResponse.json({ error: SELF_RECO_ERROR }, { status: 400 });
    }

    const { data: newContact, error } = await supabaseAdmin
      .schema(SCHEMA)
      .from("contacts")
      .insert({
        first_name: body.contactForm.first_name,
        last_name: body.contactForm.last_name,
        email: body.contactForm.email.trim(),
        phone: body.contactForm.phone,
        address: body.contactForm.address,
        city: body.contactForm.city,
        postal_code: body.contactForm.postal_code,
        user_id: currentUserId,
        country: "FR",
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: `Erreur création du recommandé: ${error.message}` }, { status: 500 });
    }
    contactId = newContact.id;
  }

  if (!contactId) {
    return NextResponse.json({ error: "Recommandé et professionnel requis" }, { status: 400 });
  }

  const { data: contactRow, error: contactError } = await supabaseAdmin
    .schema(SCHEMA)
    .from("contacts")
    .select("id, email, user_id")
    .eq("id", contactId)
    .maybeSingle();

  if (contactError || !contactRow) {
    return NextResponse.json({ error: "Recommandé introuvable" }, { status: 400 });
  }

  if (contactRow.user_id !== currentUserId) {
    return NextResponse.json({ error: "Recommandé non autorisé" }, { status: 403 });
  }

  if (normalizeEmail(contactRow.email) === accountEmail) {
    return NextResponse.json({ error: SELF_RECO_ERROR }, { status: 400 });
  }

  const { data: recommendation, error: recError } = await supabaseAdmin
    .schema(SCHEMA)
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
