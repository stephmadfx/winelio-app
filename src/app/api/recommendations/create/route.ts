import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

type SelfProfile = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

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
  selfForMe: boolean;
  createContact: boolean;
  selfProfile: SelfProfile | null;
  contactForm: ContactFormData | null;
};

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Session expirée — veuillez vous reconnecter" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const currentUserId = user.id;

  let contactId = body.selectedContactId;

  if (body.selfForMe && body.selfProfile) {
    const { data: existing } = await supabaseAdmin
      .schema("winelio")
      .from("contacts")
      .select("id")
      .eq("user_id", currentUserId)
      .eq("email", body.selfProfile.email)
      .maybeSingle();
    if (existing) {
      contactId = existing.id;
    } else {
      const { data: newContact, error } = await supabaseAdmin
        .schema("winelio")
        .from("contacts")
        .insert({
          ...body.selfProfile,
          user_id: currentUserId,
          address: "",
          city: "",
          postal_code: "",
          country: "FR",
        })
        .select("id")
        .single();
      if (error) {
        return NextResponse.json({ error: `Erreur création contact: ${error.message}` }, { status: 500 });
      }
      contactId = newContact.id;
    }
  } else if (body.createContact && body.contactForm) {
    const { data: newContact, error } = await supabaseAdmin
      .schema("winelio")
      .from("contacts")
      .insert({ ...body.contactForm, user_id: currentUserId, country: "FR" })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: `Erreur création contact: ${error.message}` }, { status: 500 });
    }
    contactId = newContact.id;
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
    })
    .select("id")
    .single();

  if (recError) {
    return NextResponse.json({ error: `Erreur création recommandation: ${recError.message}` }, { status: 500 });
  }

  return NextResponse.json({ recommendation });
}
