import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json({ error: "Ce lien de validation n’est plus utilisé. Le recommandeur assure désormais le suivi dans Winelio." }, { status: 410 });
}
export const GET = retired;
export const POST = retired;
