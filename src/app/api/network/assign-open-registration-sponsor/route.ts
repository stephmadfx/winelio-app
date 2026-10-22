import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "L’inscription sans code de parrainage est désactivée." },
    { status: 410 }
  );
}
