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

  const { data: sigUrlData } = supabaseAdmin.storage
    .from("legal-signatures")
    .getPublicUrl(signaturePath);

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

  // 4. Génération PDF
  const pdfBuffer = await generateSignedPDF({
    documentId: params.cguDocumentId,
    signerName: fullName,
    signatureImageUrl: sigUrlData.publicUrl,
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

  const { data: pdfUrlData } = supabaseAdmin.storage
    .from("legal-signatures")
    .getPublicUrl(pdfPath);

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
      signature_image_url: sigUrlData.publicUrl,
      pdf_url: pdfUrlData.publicUrl,
      signer_name: fullName,
    },
  });

  // 7. Activation profil professionnel
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ is_professional: true, pro_engagement_accepted: true })
    .eq("id", user.id);
  if (profileError) throw new Error(`Erreur activation profil : ${profileError.message}`);

  // 8. Email de confirmation (fire & forget)
  if (user.email) {
    sendSignatureConfirmationEmail({
      to: user.email,
      firstName: profile?.first_name ?? "",
      pdfBuffer,
      signedAt,
    }).catch((err) => console.error("[signAgentCGU] Email error:", err));
  }

  return { success: true, pdfUrl: pdfUrlData.publicUrl };
}
