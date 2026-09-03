import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyClientRecommendationToken } from "@/lib/client-recommendation-token";
import { notifyClientRecommendationDecision } from "@/lib/notify-client-recommendation-action";

type ClientDecision = "confirm" | "dispute";

function invalidTokenResponse() {
  return NextResponse.json(
    { error: "Ce lien est invalide ou a expiré." },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const verified = verifyClientRecommendationToken(token);
  if (!verified.ok) return invalidTokenResponse();

  const { data: rec, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, amount, expected_completion_at,
       client_quote_status, client_quote_token_version, client_quote_token_expires_at,
       client_completion_status, client_completion_token_version, client_completion_token_expires_at,
       contact:contacts(first_name, last_name),
       professional:profiles!recommendations_professional_id_fkey(first_name, last_name, companies(name, deleted_at))`,
    )
    .eq("id", verified.payload.rid)
    .single();
  if (error || !rec) {
    return NextResponse.json(
      { error: "Cette recommandation n'existe plus." },
      { status: 404 },
    );
  }

  const purpose = verified.payload.purpose;
  const status =
    purpose === "quote"
      ? rec.client_quote_status
      : rec.client_completion_status;
  const currentVersion =
    purpose === "quote"
      ? rec.client_quote_token_version
      : rec.client_completion_token_version;
  const expiresAt =
    purpose === "quote"
      ? rec.client_quote_token_expires_at
      : rec.client_completion_token_expires_at;
  const finalStatus = purpose === "quote" ? "accepted" : "confirmed";

  const isAlreadyProcessed = status === finalStatus;
  if (
    !isAlreadyProcessed &&
    (status !== "pending" ||
      currentVersion !== verified.payload.tokenVersion ||
      !expiresAt ||
      new Date(expiresAt).getTime() < Date.now())
  ) {
    return invalidTokenResponse();
  }

  const contactRaw = Array.isArray(rec.contact) ? rec.contact[0] : rec.contact;
  const professionalRaw = Array.isArray(rec.professional)
    ? rec.professional[0]
    : rec.professional;
  const companies = Array.isArray(professionalRaw?.companies)
    ? professionalRaw.companies
    : professionalRaw?.companies
      ? [professionalRaw.companies]
      : [];
  const company = companies.find(
    (item: { deleted_at?: string | null }) => !item.deleted_at,
  ) as { name?: string | null } | undefined;

  return NextResponse.json({
    purpose,
    status,
    alreadyProcessed: isAlreadyProcessed,
    amount: purpose === "quote" ? rec.amount : null,
    expectedCompletionAt: rec.expected_completion_at,
    contactFirstName: contactRaw?.first_name ?? null,
    professionalName:
      company?.name ||
      [professionalRaw?.first_name, professionalRaw?.last_name]
        .filter(Boolean)
        .join(" ") ||
      "Le professionnel",
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const decision = body?.decision as ClientDecision;
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!(["confirm", "dispute"] as const).includes(decision)) {
    return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });
  }
  if (decision === "dispute" && note.length < 5) {
    return NextResponse.json(
      { error: "Décrivez le problème en quelques mots." },
      { status: 400 },
    );
  }
  if (note.length > 1000) {
    return NextResponse.json(
      { error: "Le message est limité à 1 000 caractères." },
      { status: 400 },
    );
  }

  const verified = verifyClientRecommendationToken(token);
  if (!verified.ok) return invalidTokenResponse();

  const { data, error } = await supabaseAdmin
    .schema("winelio")
    .rpc("apply_client_recommendation_action", {
      p_recommendation_id: verified.payload.rid,
      p_purpose: verified.payload.purpose,
      p_token_version: verified.payload.tokenVersion,
      p_decision: decision,
      p_note: note || null,
    });

  if (error) {
    const expectedClientError = [
      "invalid_or_expired_token",
      "note_required",
      "quote_not_submitted",
      "work_not_declared_complete",
    ].some((code) => error.message.includes(code));
    console.error("[client-action] apply failed:", error.message);
    return NextResponse.json(
      {
        error: expectedClientError
          ? "Ce lien n'est plus utilisable ou l'étape précédente n'est pas terminée."
          : "Votre réponse n'a pas pu être enregistrée.",
      },
      { status: expectedClientError ? 409 : 500 },
    );
  }

  const result = data as {
    ok?: boolean;
    status?: string;
    already_processed?: boolean;
  } | null;

  await notifyClientRecommendationDecision({
    recommendationId: verified.payload.rid,
    purpose: verified.payload.purpose,
    decision,
    note,
    tokenVersion: verified.payload.tokenVersion,
  }).catch((notificationError) =>
    console.error("[client-action] notification failed:", notificationError),
  );

  return NextResponse.json({
    ok: true,
    status: result?.status,
    alreadyProcessed: Boolean(result?.already_processed),
    commissionPaymentPrepared: true,
  });
}
