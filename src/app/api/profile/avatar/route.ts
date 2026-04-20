import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  extractProfileAvatarPath,
  PROFILE_AVATAR_BUCKET,
  resolveProfileAvatarUrl,
} from "@/lib/profile-avatar";

const MAX_SIZE = 5 * 1024 * 1024;

function buildAvatarPath(userId: string, filename?: string) {
  const ext = filename?.split(".").pop()?.toLowerCase() || "jpg";
  return `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}

async function readCurrentAvatarPath(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("avatar")
    .eq("id", userId)
    .maybeSingle();

  return extractProfileAvatarPath(data?.avatar);
}

async function ensureBucketExists() {
  const { data } = await supabaseAdmin.storage.getBucket(PROFILE_AVATAR_BUCKET);
  if (data) return;

  const { error } = await supabaseAdmin.storage.createBucket(PROFILE_AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE,
  });

  if (error) {
    throw error;
  }
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Merci de choisir une image valide." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "L'image ne doit pas dépasser 5 Mo." }, { status: 400 });
  }

  const avatarPath = buildAvatarPath(user.id, file.name);
  const previousAvatarPath = await readCurrentAvatarPath(user.id);

  await ensureBucketExists();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(avatarPath, Buffer.from(await file.arrayBuffer()), {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

  if (uploadError) {
    return NextResponse.json({ error: "Impossible d'envoyer la photo." }, { status: 500 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(PROFILE_AVATAR_BUCKET)
    .getPublicUrl(avatarPath);

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ avatar: avatarPath })
    .eq("id", user.id);

  if (updateError) {
    await supabaseAdmin.storage.from(PROFILE_AVATAR_BUCKET).remove([avatarPath]).catch(() => {});
    return NextResponse.json({ error: "Impossible d'enregistrer la photo." }, { status: 500 });
  }

  if (previousAvatarPath && previousAvatarPath !== avatarPath) {
    await supabaseAdmin.storage.from(PROFILE_AVATAR_BUCKET).remove([previousAvatarPath]).catch(() => {});
  }

  return NextResponse.json({
    avatar: avatarPath,
    publicUrl: resolveProfileAvatarUrl(avatarPath) ?? publicUrlData.publicUrl,
  });
}

export async function DELETE() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const previousAvatarPath = await readCurrentAvatarPath(user.id);

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ avatar: null })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Impossible de supprimer la photo." }, { status: 500 });
  }

  if (previousAvatarPath) {
    await supabaseAdmin.storage.from(PROFILE_AVATAR_BUCKET).remove([previousAvatarPath]).catch(() => {});
  }

  return NextResponse.json({ avatar: null });
}
