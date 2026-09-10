import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const [profile, contacts, categories] = await Promise.all([
    db.from("profiles").select("first_name,last_name,phone,is_professional").eq("id", user.id).single(),
    db.from("contacts").select("id,first_name,last_name,email,phone").eq("user_id", user.id).order("last_name"),
    db.from("categories").select("id,name").order("name"),
  ]);
  if (profile.error || contacts.error || categories.error) return NextResponse.json({ error: "Impossible de charger les informations de la recommandation." }, { status: 500 });
  return NextResponse.json({ userId: user.id, profile: { ...profile.data, email: user.email ?? "" }, contacts: contacts.data, categories: categories.data }, { headers: { "Cache-Control": "no-store" } });
}
