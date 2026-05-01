import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg doit rester en require() natif — le bundler webpack le transforme incorrectement
  serverExternalPackages: ["pg", "pg-pool"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Isole la fenêtre des autres origines. 'same-origin-allow-popups' = Stripe Checkout
          // popup reste fonctionnel mais window.opener cross-origin est neutralisé.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Empêche les sites tiers d'embarquer nos ressources via <img>, <script>, etc.
          // 'same-site' permet à dev2.winelio.app et winelio.app de partager si besoin.
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev https://supabase.aide-multimedia.fr https://*.supabase.co https://*.stripe.com",
              "media-src 'self' https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev https://supabase.aide-multimedia.fr https://*.supabase.co",
              "font-src 'self'",
              "connect-src 'self' https://supabase.aide-multimedia.fr wss://supabase.aide-multimedia.fr https://geo.api.gouv.fr https://recherche-entreprises.api.gouv.fr",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
