"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuditContext, getDocumentHash, logOnboardingEvent } from "@/lib/audit";
import { generateSignedPDF } from "@/lib/generate-signed-pdf";
import { sendSignatureConfirmationEmail } from "@/lib/notify-signature-cgu";

export async function signAgentCGU(params: {
  signatureBase64: string;
  cguDocumentId: string;
}): Promise<{ success: true; pdfUrl: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { ip, userAgent } = await getAuditContext();
  const timestamp = Date.now();

  // 1. Upload image de signature
  const signatureBuffer = Buffer.from(
    params.signatureBase64.replace(/^data:image\/png;base64,/, ""),
    "base64"
  );
  const signaturePath = `signatures/${user.id}/signature-${timestamp}.png`;
  const { error: uploadSigError } = await supabaseAdmin.storage
    .from("legal-signatures")
    .upload(signaturePath, signatureBuffer, { contentType: "image/png" });
  if (uploadSigError) throw new Error(`Erreur upload signature : ${uploadSigError.message}`);

  // L'image de signature est embarquée en data URI dans le PDF (bucket privé, pas d'URL publique)
  const signatureDataUri = `data:image/png;base64,${signatureBuffer.toString("base64")}`;

  // 2. Hash SHA-256 du document
  const docHashData = await getDocumentHash(params.cguDocumentId);
  if (!docHashData) throw new Error("Document CGU introuvable");

  // 3. Profil du signataire
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();
  const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  const signedAt = new Date();

  // 4. Génération PDF (image de signature en data URI — pas de dépendance à une URL externe)
  const pdfBuffer = await generateSignedPDF({
    documentId: params.cguDocumentId,
    signerName: fullName,
    signatureImageUrl: signatureDataUri,
    signedAt,
    ip,
    documentHash: docHashData.hash,
  });

  // 5. Upload PDF
  const pdfPath = `signed-documents/${user.id}/cgu-agents-immo-${timestamp}.pdf`;
  const { error: uploadPdfError } = await supabaseAdmin.storage
    .from("legal-signatures")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf" });
  if (uploadPdfError) throw new Error(`Erreur upload PDF : ${uploadPdfError.message}`);

  // Signed URLs valables 1 an pour le téléchargement (bucket privé)
  const ONE_YEAR_SECONDS = 365 * 24 * 3600;
  const { data: sigSignedUrl } = await supabaseAdmin.storage
    .from("legal-signatures")
    .createSignedUrl(signaturePath, ONE_YEAR_SECONDS);
  const { data: pdfSignedUrl } = await supabaseAdmin.storage
    .from("legal-signatures")
    .createSignedUrl(pdfPath, ONE_YEAR_SECONDS);
  if (!pdfSignedUrl?.signedUrl) throw new Error("Impossible de générer l'URL signée du PDF");

  // 6. Log audit
  await logOnboardingEvent({
    userId: user.id,
    eventType: "signature_completed",
    ip,
    userAgent,
    documentId: params.cguDocumentId,
    documentVersion: docHashData.version,
    documentHash: docHashData.hash,
    metadata: {
      signature_image_url: sigSignedUrl?.signedUrl ?? signaturePath,
      pdf_url: pdfSignedUrl.signedUrl,
      signer_name: fullName,
    },
  });

  // 7. Activation profil professionnel — on capture l'état précédent
  // pour ne notifier le parrain qu'à la 1re activation pro.
  const { data: previousProfile } = await supabaseAdmin
    .from("profiles")
    .select("is_professional, work_mode")
    .eq("id", user.id)
    .single();
  const wasAlreadyPro = !!previousProfile?.is_professional;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ is_professional: true, pro_engagement_accepted: true })
    .eq("id", user.id);
  if (profileError) throw new Error(`Erreur activation profil : ${profileError.message}`);

  // 7bis. Notifier le parrain niveau 1 (fire & forget) à la première activation pro
  if (!wasAlreadyPro) {
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("category:categories(name)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const rawCat = company ? (company as Record<string, unknown>).category : null;
    const categoryName = Array.isArray(rawCat)
      ? (rawCat[0] as { name: string } | undefined)?.name ?? null
      : (rawCat as { name: string } | null)?.name ?? null;

    const { notifyNewProInNetwork } = await import("@/lib/notify-new-pro-in-network");
    notifyNewProInNetwork(user.id, {
      categoryName,
      workMode: previousProfile?.work_mode ?? null,
    }).catch((err) => console.error("[signAgentCGU] notify-new-pro-in-network error:", err));
  }

  // 8. Email de confirmation (fire & forget)
  if (user.email) {
    sendSignatureConfirmationEmail({
      to: user.email,
      firstName: profile?.first_name ?? "",
      pdfBuffer,
      signedAt,
    }).catch((err) => console.error("[signAgentCGU] Email error:", err));
  }

  return { success: true, pdfUrl: pdfSignedUrl.signedUrl };
}
