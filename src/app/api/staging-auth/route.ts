import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const stagingPassword = process.env.STAGING_PASSWORD;
  if (!stagingPassword) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const formData = await req.formData();
  const password = formData.get("password") as string | null;

  if (password !== stagingPassword) {
    return NextResponse.redirect(new URL("/staging-login?error=1", req.url));
  }

  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.set("staging_auth", stagingPassword, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 jours
    secure: true,
  });
  return response;
}
