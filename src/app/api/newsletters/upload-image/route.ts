import { NextResponse } from "next/server";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";
import { uploadNewsletterImage } from "@/lib/newsletter-upload";

export async function POST(req: Request) {
  try {
    await assertNewsletterAdmin();
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    const url = await uploadNewsletterImage(file);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload impossible";
    const status = message === "Accès refusé" ? 403 : message === "Non authentifié" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
