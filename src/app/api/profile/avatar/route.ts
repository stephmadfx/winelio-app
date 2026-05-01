import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadAvatar, deleteAvatar } from "@/lib/r2-avatars";

const MAX_SIZE = 5 * 1024 * 1024;

function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "avatar";
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Le fichier doit être une image" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "L'image ne doit pas dépasser 5 Mo" }, { status: 400 });
    }

    const ext = sanitizeFilename(file.name).split(".").pop() || "jpg";
    const key = `users/${user.id}/${Date.now()}-${sanitizeFilename(file.name).replace(/\.[^.]+$/, "")}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    await uploadAvatar(key, bytes, file.type);

    // Supprimer l'ancien avatar du bucket pour éviter l'accumulation
    const { data: previous } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .select("avatar")
      .eq("id", user.id)
      .maybeSingle();
    const oldKey = previous?.avatar;
    if (oldKey && !/^https?:\/\//i.test(oldKey) && oldKey !== key) {
      deleteAvatar(oldKey).catch((e) => console.error("[avatar] cleanup old failed:", e));
    }

    const { error: updateError } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .update({ avatar: key })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, key });
  } catch (error) {
    console.error("[profile/avatar] upload error:", error);
    return NextResponse.json(
      { error: "Impossible de mettre à jour la photo de profil." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .select("avatar")
      .eq("id", user.id)
      .maybeSingle();

    const avatar = profile?.avatar;

    if (avatar && !/^https?:\/\//i.test(avatar)) {
      const key = avatar.replace(/^\/+/, "");
      if (key) {
        await deleteAvatar(key).catch((e) => console.error("[avatar] r2 delete failed:", e));
      }
    }

    const { error: updateError } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .update({ avatar: null })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[profile/avatar] delete error:", error);
    return NextResponse.json(
      { error: "Impossible de supprimer la photo de profil." },
      { status: 500 }
    );
  }
}
