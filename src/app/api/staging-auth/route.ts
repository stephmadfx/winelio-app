import { NextRequest, NextResponse } from "next/server";

/**
 * Reconstruit l'URL publique à partir des headers de proxy Coolify/Traefik.
 * `req.url` côté Next.js dans un container Docker pointe vers l'adresse interne
 * (https://0.0.0.0:3000) ; on doit utiliser X-Forwarded-Host + X-Forwarded-Proto
 * pour fabriquer la vraie URL publique.
 */
function publicUrl(req: NextRequest, path: string): URL {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    return new URL(path, `${proto}://${host}`);
  }
  // Dernier recours : env explicite, puis req.url (cas dev local)
  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.url;
  return new URL(path, base);
}

export async function POST(req: NextRequest) {
  const stagingPassword = process.env.STAGING_PASSWORD;
  if (!stagingPassword) {
    return NextResponse.redirect(publicUrl(req, "/"));
  }

  const formData = await req.formData();
  const password = formData.get("password") as string | null;

  if (password !== stagingPassword) {
    return NextResponse.redirect(publicUrl(req, "/staging-login?error=1"));
  }

  const response = NextResponse.redirect(publicUrl(req, "/"));
  response.cookies.set("staging_auth", stagingPassword, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 jours
    secure: true,
  });
  return response;
}
