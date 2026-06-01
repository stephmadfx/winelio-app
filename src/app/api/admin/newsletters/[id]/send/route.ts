import { NextResponse } from "next/server";
import { assertSuperAdmin, sendNewsletter } from "@/lib/newsletter";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const result = await sendNewsletter(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur d'envoi" },
      { status: 400 }
    );
  }
}
