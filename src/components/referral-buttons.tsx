"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function CopyButton({ code }: { code: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const handleCopy = async () => {
    const url = `${window.location.origin}/auth/login?mode=register&ref=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      // Fallback pour les contextes sans clipboard API
      try {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setStatus("copied");
      } catch {
        setStatus("error");
      }
    }
    setTimeout(() => setStatus("idle"), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
    >
      {status === "copied" ? (
        <>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copié !
        </>
      ) : status === "error" ? (
        <>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Erreur
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copier
        </>
      )}
    </button>
  );
}

export function EmailInviteButton({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSend = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/network/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, personalMessage: message.trim() || undefined }),
      });
      if (res.ok) {
        setStatus("sent");
        setTimeout(() => {
          setOpen(false);
          setEmail("");
          setMessage("");
          setStatus("idle");
        }, 2000);
      } else {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const referralUrl = typeof window !== "undefined"
    ? `${window.location.origin}/auth/login?mode=register&ref=${code}`
    : `https://winelio.fr/auth/login?mode=register&ref=${code}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-3 border-2 border-winelio-orange text-winelio-orange font-semibold rounded-xl hover:bg-winelio-orange hover:text-white transition-colors cursor-pointer"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Inviter
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 overflow-hidden rounded-2xl">
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-winelio-orange to-winelio-amber p-6 text-white">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">🤝</span>
              <div>
                <DialogHeader>
                  <DialogTitle className="text-white text-lg font-bold leading-tight">
                    Inviter par email
                  </DialogTitle>
                  <DialogDescription className="text-white/80 text-sm">
                    Envoyez votre lien de parrainage directement
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Preview lien */}
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-500 break-all leading-relaxed border border-slate-100">
              <span className="font-semibold text-slate-600 block mb-1">Lien de parrainage</span>
              {referralUrl}
            </div>

            {/* Email destinataire */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                Email du destinataire <span className="text-winelio-orange">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="exemple@email.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/20 transition-all"
                onKeyDown={e => e.key === "Enter" && handleSend()}
              />
            </div>

            {/* Message personnel */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                Message personnel <span className="text-slate-400 font-normal">(facultatif)</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Bonjour ! Je pense que Winelio peut vraiment t'aider à développer ton activité…"
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/20 transition-all resize-none"
              />
            </div>

            {/* Bouton envoyer */}
            <button
              onClick={handleSend}
              disabled={!email || status === "sending" || status === "sent"}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
                bg-gradient-to-r from-winelio-orange to-winelio-amber text-white hover:opacity-90 active:scale-[0.98]"
            >
              {status === "sending" && (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Envoi en cours…
                </span>
              )}
              {status === "sent" && (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Invitation envoyée !
                </span>
              )}
              {status === "error" && "❌ Erreur — réessayez"}
              {status === "idle" && (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                  </svg>
                  Envoyer l&apos;invitation
                </span>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ShareButton({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const referralUrl = typeof window !== "undefined"
    ? `${window.location.origin}/auth/login?mode=register&ref=${code}`
    : `https://winelio.fr/auth/login?mode=register&ref=${code}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
    } catch {
      const el = document.createElement("textarea");
      el.value = referralUrl;
      el.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Rejoins Winelio",
        text: "Rejoins Winelio avec mon lien de parrainage !",
        url: referralUrl,
      });
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-3 border-2 border-winelio-orange text-winelio-orange font-semibold rounded-xl hover:bg-winelio-orange hover:text-white transition-colors cursor-pointer"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Partager
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 overflow-hidden rounded-2xl flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-winelio-orange to-winelio-amber px-6 pt-6 pb-5 text-white text-center">
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-bold">
                Partagez votre lien
              </DialogTitle>
              <DialogDescription className="text-white/80 text-sm">
                Scannez ou partagez pour inviter
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 flex flex-col items-center gap-5 w-full">
            {/* QR Code */}
            <div className="relative mx-auto">
              <div className="w-48 h-48 rounded-2xl overflow-hidden border-4 border-white shadow-lg bg-white flex items-center justify-center">
                <QRCodeSVG
                  value={referralUrl}
                  size={168}
                  bgColor="#ffffff"
                  fgColor="#2D3436"
                  level="M"
                  style={{ display: "block" }}
                />
              </div>
              {/* Badge code parrain */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md whitespace-nowrap tracking-wider">
                {code.toUpperCase()}
              </div>
            </div>

            {/* Lien */}
            <div className="w-full mt-2 bg-slate-50 rounded-xl border border-slate-100 px-3 py-2.5 flex items-center gap-2 min-w-0">
              <span className="flex-1 text-xs text-slate-500 truncate min-w-0">{referralUrl}</span>
              <button
                onClick={handleCopyLink}
                className="shrink-0 text-winelio-orange hover:text-winelio-amber transition-colors cursor-pointer"
                title="Copier le lien"
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Partage natif (mobile) */}
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={handleNativeShare}
                className="w-full py-3 rounded-xl border-2 border-winelio-orange text-winelio-orange font-semibold text-sm flex items-center justify-center gap-2 hover:bg-winelio-orange hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Partager via…
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
