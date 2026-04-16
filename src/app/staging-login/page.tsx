export default function StagingLoginPage() {
  return (
    <html lang="fr">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Accès restreint — Winelio Dev</title>
      </head>
      <body style={{ margin: 0, padding: 0, background: "#F0F2F4", fontFamily: "Arial, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: "40px 48px", maxWidth: 400, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ height: 4, background: "linear-gradient(90deg,#FF6B35,#F7931E)", borderRadius: "4px 4px 0 0", margin: "-40px -48px 32px" }} />
          <p style={{ textAlign: "center", margin: "0 0 24px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png"
              width={140}
              height={38}
              alt="Winelio"
              style={{ display: "block", margin: "0 auto" }}
            />
          </p>
          <p style={{ textAlign: "center", color: "#636E72", fontSize: 14, margin: "0 0 28px" }}>
            Environnement de développement — accès restreint
          </p>
          <form action="/api/staging-auth" method="POST">
            <label style={{ display: "block", color: "#2D3436", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Mot de passe
            </label>
            <input
              type="password"
              name="password"
              autoFocus
              placeholder="••••••••"
              style={{ display: "block", width: "100%", padding: "10px 14px", border: "1px solid #E0E0E0", borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginBottom: 16, outline: "none" }}
            />
            <button
              type="submit"
              style={{ display: "block", width: "100%", padding: "12px", background: "linear-gradient(135deg,#FF6B35,#F7931E)", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              Accéder →
            </button>
          </form>
        </div>
      </body>
    </html>
  );
}
