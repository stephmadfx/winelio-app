"use client";

import { useEffect, useState } from "react";
import { APP_STORE_URL, referralAppLink, referralClipboardLink, referralPlayStoreLink, type ReferralInvite } from "@/lib/referral-install";

export function ReferralAppInstall({ invite, className }: { invite: ReferralInvite; className: string }) {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [error, setError] = useState("");
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    if (/WinelioNative\//.test(navigator.userAgent)) return;
    if (/Android/i.test(navigator.userAgent)) setPlatform("android");
    else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) setPlatform("ios");
  }, []);
  if (!platform) return null;

  const installOnIPhone = async () => {
    setCopying(true);
    setError("");
    try {
      await navigator.clipboard.writeText(referralClipboardLink(invite));
      window.location.assign(APP_STORE_URL);
    } catch {
      setError("La copie du lien a été refusée. Autorisez-la puis réessayez, ou installez Winelio et revenez toucher « Ouvrir mon invitation ».");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {platform === "android" ? (
        <a href={referralPlayStoreLink(invite)} className={className}>Télécharger sur Android</a>
      ) : (
        <button type="button" className={className} onClick={installOnIPhone} disabled={copying}>
          {copying ? "Préparation…" : "Télécharger sur iPhone"}
        </button>
      )}
      <p className="text-xs text-winelio-gray">
        {platform === "ios"
          ? "Votre lien sera copié pour retrouver votre parrain dans Winelio. Après installation, autorisez le collage dans l’application."
          : "Votre code de parrainage sera transmis lors de l’installation depuis Google Play."}
      </p>
      <a href={referralAppLink(invite)} className="text-sm font-semibold text-winelio-orange underline underline-offset-4">
        Déjà installée ? Ouvrir mon invitation
      </a>
      {error && <p role="alert" className="text-sm text-red-600">{error} <a className="underline" href={APP_STORE_URL}>Ouvrir l’App Store</a></p>}
    </div>
  );
}
