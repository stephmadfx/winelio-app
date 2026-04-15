// src/lib/audit.ts
import { headers } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getAuditContext(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  return {
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      "unknown",
    userAgent: h.get("user-agent") ?? "unknown",
  };
}

export function hashDocument(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function getDocumentHash(
  documentId: string
): Promise<{ hash: string; version: string } | null> {
  try {
    const [
      { data: sections, error: sectionsError },
      { data: doc, error: docError },
    ] = await Promise.all([
      supabaseAdmin
        .from("document_sections")
        .select("content")
        .eq("document_id", documentId)
        .order("order_index"),
      supabaseAdmin
        .from("legal_documents")
        .select("version")
        .eq("id", documentId)
        .single(),
    ]);

    if (sectionsError || docError || !sections || !doc) return null;

    const fullContent = sections.map((s) => s.content).join("\n\n");
    return { hash: hashDocument(fullContent), version: doc.version };
  } catch (err) {
    console.error(`[audit] Error fetching document hash for ${documentId}:`, err);
    return null;
  }
}

type OnboardingEventPayload = {
  userId: string;
  eventType:
    | "cgu_accepted"
    | "engagement_accepted"
    | "siret_provided"
    | "category_set"
    | "pro_activated"
    | "signature_completed";
  ip: string;
  userAgent: string;
  documentId?: string;
  documentVersion?: string;
  documentHash?: string;
  metadata?: Record<string, unknown>;
};

export async function logOnboardingEvent(
  payload: OnboardingEventPayload
): Promise<void> {
  const { error } = await supabaseAdmin.from("pro_onboarding_events").insert({
    user_id: payload.userId,
    event_type: payload.eventType,
    ip_address: payload.ip,
    user_agent: payload.userAgent,
    document_id: payload.documentId ?? null,
    document_version: payload.documentVersion ?? null,
    document_hash: payload.documentHash ?? null,
    metadata: payload.metadata ?? null,
  });

  if (error) {
    throw new Error(
      `Failed to log onboarding event for user ${payload.userId}: ${error.message}`
    );
  }
}
