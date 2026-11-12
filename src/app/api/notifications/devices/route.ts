import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getOrCreateVapidKeys,
  parseWebPushSubscription,
} from "@/lib/push-notifications";

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const [vapid, { data: devices }] = await Promise.all([
      getOrCreateVapidKeys(),
      supabaseAdmin
        .from("devices")
        .select("id, platform, device_label, updated_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false }),
    ]);

    return NextResponse.json({
      vapidPublicKey: vapid.publicKey,
      devices: (devices ?? []).map((d) => ({
        id: d.id,
        platform: d.platform,
        label: d.device_label,
        updatedAt: d.updated_at,
      })),
    });
  } catch (err) {
    console.error("[notifications/devices] GET error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      platform?: "ios" | "android" | "web";
      token?: string;
      subscription?: unknown;
      label?: string;
    };

    const platform = body.platform;
    if (platform !== "ios" && platform !== "android" && platform !== "web") {
      return NextResponse.json({ error: "Plateforme invalide" }, { status: 400 });
    }

    let normalizedToken = "";
    if (platform === "web") {
      const parsed = parseWebPushSubscription(body.subscription);
      if (!parsed) {
        return NextResponse.json({ error: "Abonnement Web Push invalide" }, { status: 400 });
      }
      normalizedToken = JSON.stringify(parsed);
    } else if (platform === "ios") {
      const cleanHex = String(body.token || "").trim().replace(/[<>\s]/g, "");
      if (!/^[0-9a-f]{32,200}$/i.test(cleanHex)) {
        return NextResponse.json({ error: "Jeton iOS invalide" }, { status: 400 });
      }
      normalizedToken = cleanHex;
    } else {
      const cleanFcm = String(body.token || "").trim();
      if (cleanFcm.length < 20 || cleanFcm.length > 4096) {
        return NextResponse.json({ error: "Jeton Android invalide" }, { status: 400 });
      }
      normalizedToken = cleanFcm;
    }

    const label = body.label
      ? String(body.label).trim().slice(0, 80)
      : platform === "ios"
      ? "iPhone"
      : platform === "android"
      ? "Android"
      : "Navigateur";

    const nowIso = new Date().toISOString();
    const { error } = await supabaseAdmin.from("devices").upsert(
      {
        user_id: user.id,
        token: normalizedToken,
        platform,
        device_label: label,
        is_active: true,
        updated_at: nowIso,
      },
      { onConflict: "token" },
    );

    if (error) {
      console.error("[notifications/devices] upsert error:", error);
      return NextResponse.json({ error: "Enregistrement de l'appareil impossible" }, { status: 500 });
    }

    return NextResponse.json({ success: true, platform });
  } catch (err) {
    console.error("[notifications/devices] POST error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      endpoint?: string;
      deviceId?: string;
      all?: boolean;
    };

    const nowIso = new Date().toISOString();

    if (body.all) {
      await supabaseAdmin
        .from("devices")
        .update({ is_active: false, updated_at: nowIso })
        .eq("user_id", user.id);
      return NextResponse.json({ success: true });
    }

    if (body.deviceId) {
      await supabaseAdmin
        .from("devices")
        .update({ is_active: false, updated_at: nowIso })
        .eq("id", body.deviceId)
        .eq("user_id", user.id);
      return NextResponse.json({ success: true });
    }

    if (body.token) {
      await supabaseAdmin
        .from("devices")
        .update({ is_active: false, updated_at: nowIso })
        .eq("token", String(body.token).trim())
        .eq("user_id", user.id);
      return NextResponse.json({ success: true });
    }

    if (body.endpoint) {
      const { data: webDevices } = await supabaseAdmin
        .from("devices")
        .select("id, token")
        .eq("user_id", user.id)
        .eq("platform", "web")
        .eq("is_active", true);

      const matchingIds = (webDevices ?? [])
        .filter((d) => {
          try {
            return JSON.parse(d.token)?.endpoint === body.endpoint;
          } catch {
            return false;
          }
        })
        .map((d) => d.id);

      if (matchingIds.length > 0) {
        await supabaseAdmin
          .from("devices")
          .update({ is_active: false, updated_at: nowIso })
          .in("id", matchingIds);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Paramètre manquant" }, { status: 400 });
  } catch (err) {
    console.error("[notifications/devices] DELETE error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
