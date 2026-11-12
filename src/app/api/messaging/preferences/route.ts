import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getChannelAccess, getMessagingActor } from "@/lib/messaging";
import { normalizeNotificationPreferences } from "@/lib/push-notifications";

const PREFS_SELECT =
  "in_app_badges, email_major_announcements, notify_official_announcements, notify_community_messages, notify_message_replies, notify_new_referral, charter_accepted_at";

export async function GET() {
  try {
    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data } = await supabaseAdmin
      .from("messaging_preferences")
      .select(PREFS_SELECT)
      .eq("user_id", actor.userId)
      .maybeSingle();

    const normalized = normalizeNotificationPreferences(data);

    return NextResponse.json({
      ...normalized,
      charter_accepted_at: data?.charter_accepted_at ?? null,
    });
  } catch (err) {
    console.error("[messaging/preferences] GET error:", err);
    return NextResponse.json({ error: "Préférences indisponibles" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      in_app_badges?: boolean;
      email_major_announcements?: boolean;
      notify_official_announcements?: boolean;
      notify_community_messages?: boolean;
      notify_message_replies?: boolean;
      notify_new_referral?: boolean;
      acceptCharter?: boolean;
      channelId?: string;
      mute?: "off" | "1h" | "24h" | "forever";
      markReadChannelId?: string;
    };

    // 1. Mise en sourdine d'un salon
    if (body.channelId && body.mute) {
      if (!actor.eligible) {
        return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
      }
      const access = await getChannelAccess(actor, body.channelId);
      if (!access) {
        return NextResponse.json({ error: "Salon inaccessible" }, { status: 403 });
      }

      let mutedUntil: string | null = null;
      if (body.mute === "1h") {
        mutedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      } else if (body.mute === "24h") {
        mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else if (body.mute === "forever") {
        mutedUntil = "9999-12-31T23:59:59.000Z";
      }

      await supabaseAdmin.from("messaging_memberships").upsert(
        {
          channel_id: body.channelId,
          user_id: actor.userId,
          role: access.role,
          muted_until: mutedUntil,
        },
        { onConflict: "channel_id,user_id" },
      );

      return NextResponse.json({ success: true, mutedUntil });
    }

    // 2. Marquage d'un salon comme lu
    if (body.markReadChannelId) {
      if (!actor.eligible) {
        return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
      }
      const access = await getChannelAccess(actor, body.markReadChannelId);
      if (!access) {
        return NextResponse.json({ error: "Salon inaccessible" }, { status: 403 });
      }
      const nowIso = new Date().toISOString();
      await supabaseAdmin.from("messaging_memberships").upsert(
        {
          channel_id: body.markReadChannelId,
          user_id: actor.userId,
          role: access.role,
          last_read_at: nowIso,
        },
        { onConflict: "channel_id,user_id" },
      );
      return NextResponse.json({ success: true, lastReadAt: nowIso });
    }

    // 3. Préférences globales de notifications & acceptation de la charte communautaire
    const { data: existing } = await supabaseAdmin
      .from("messaging_preferences")
      .select(PREFS_SELECT)
      .eq("user_id", actor.userId)
      .maybeSingle();

    const current = normalizeNotificationPreferences(existing);
    const nextCharter = body.acceptCharter
      ? existing?.charter_accepted_at || new Date().toISOString()
      : existing?.charter_accepted_at ?? null;

    const nextOfficial =
      typeof body.notify_official_announcements === "boolean"
        ? body.notify_official_announcements
        : current.notify_official_announcements;

    const nextEmailMajor =
      typeof body.email_major_announcements === "boolean"
        ? body.email_major_announcements
        : typeof body.notify_official_announcements === "boolean"
        ? body.notify_official_announcements
        : current.email_major_announcements;

    const payload = {
      user_id: actor.userId,
      in_app_badges:
        typeof body.in_app_badges === "boolean" ? body.in_app_badges : current.in_app_badges,
      email_major_announcements: nextEmailMajor,
      notify_official_announcements: nextOfficial,
      notify_community_messages:
        typeof body.notify_community_messages === "boolean"
          ? body.notify_community_messages
          : current.notify_community_messages,
      notify_message_replies:
        typeof body.notify_message_replies === "boolean"
          ? body.notify_message_replies
          : current.notify_message_replies,
      notify_new_referral:
        typeof body.notify_new_referral === "boolean"
          ? body.notify_new_referral
          : current.notify_new_referral,
      charter_accepted_at: nextCharter,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("messaging_preferences")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      in_app_badges: payload.in_app_badges,
      email_major_announcements: payload.email_major_announcements,
      notify_official_announcements: payload.notify_official_announcements,
      notify_community_messages: payload.notify_community_messages,
      notify_message_replies: payload.notify_message_replies,
      notify_new_referral: payload.notify_new_referral,
      charter_accepted_at: payload.charter_accepted_at,
    });
  } catch (err) {
    console.error("[messaging/preferences] PUT error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
