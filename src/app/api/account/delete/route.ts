import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteAvatar } from "@/lib/r2-avatars";

export async function POST() {
  try {
    // 1. Vérifier l'authentification
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userId = user.id;

    // 2. Récupérer le profil (sponsor_id et sponsor_code nécessaires)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, sponsor_id, sponsor_code")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }

    // 3. Réassigner les enfants directs au grand-parent
    //    (tous ceux dont sponsor_id = userId remontent vers sponsor_id du user supprimé)
    if (profile.sponsor_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ sponsor_id: profile.sponsor_id })
        .eq("sponsor_id", userId);
    } else {
      // Pas de parrain → les enfants n'ont plus de sponsor (sponsor_id = null)
      await supabaseAdmin
        .from("profiles")
        .update({ sponsor_id: null })
        .eq("sponsor_id", userId);
    }

    // 4. Réserver le code parrain pour qu'il ne soit jamais réutilisé
    if (profile.sponsor_code) {
      await supabaseAdmin
        .from("deleted_sponsor_codes")
        .upsert({ sponsor_code: profile.sponsor_code });
    }

    // 5. Purger les photos personnelles postées dans la messagerie (RGPD)
    const { data: userMediaMessages } = await supabaseAdmin
      .from("messaging_messages")
      .select("id, attachments")
      .eq("author_id", userId);

    if (userMediaMessages && userMediaMessages.length > 0) {
      for (const m of userMediaMessages) {
        if (Array.isArray(m.attachments) && m.attachments.length > 0) {
          for (const att of m.attachments as { key?: string }[]) {
            if (typeof att?.key === "string" && att.key.startsWith("messaging/")) {
              await deleteAvatar(att.key).catch(() => {});
            }
          }
          await supabaseAdmin
            .from("messaging_messages")
            .update({ attachments: [] })
            .eq("id", m.id);
        }
      }
    }

    // 6. Supprimer les données personnelles du compte
    //    (dans l'ordre pour éviter les violations de clés étrangères)
    await Promise.all([
      // Contacts personnels
      supabaseAdmin.from("contacts").delete().eq("user_id", userId),
      // Tokens push
      supabaseAdmin.from("devices").delete().eq("user_id", userId),
      // Retraits en attente
      supabaseAdmin
        .from("withdrawals")
        .delete()
        .eq("user_id", userId)
        .eq("status", "pending"),
    ]);

    // Wallet summary
    await supabaseAdmin.from("user_wallet_summaries").delete().eq("user_id", userId);

    // Profil (après avoir réassigné les enfants)
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // 6. Supprimer le compte Supabase Auth (invalide la session)
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      return NextResponse.json(
        { error: "Erreur lors de la suppression du compte auth" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
