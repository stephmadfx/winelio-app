import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "profile-avatars";
const MAX_SIZE = 5 * 1024 * 1024;

async function ensureBucketExists() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (data) return;

  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE,
  });

  if (error) {
    throw error;
  }
}

function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

    await ensureBucketExists();

    const ext = sanitizeFilename(file.name).split(".").pop() || "jpg";
    const key = `users/${user.id}/${Date.now()}-${sanitizeFilename(file.name).replace(/\.[^.]+$/, "")}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(key, bytes, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(key);

    const publicUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ avatar: key })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, publicUrl, key });
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
      .from("profiles")
      .select("avatar")
      .eq("id", user.id)
      .maybeSingle();

    const avatar = profile?.avatar;

    if (avatar) {
      const path = avatar.startsWith("http")
        ? null
        : avatar.replace(/^\/+/, "");

      if (path) {
        await supabaseAdmin.storage.from(BUCKET).remove([path]);
      }
    }

    const { error: updateError } = await supabaseAdmin
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
