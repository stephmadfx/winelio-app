"use client";

import { useState } from "react";

export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = `${window.location.origin}/auth/register?ref=${code}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
    >
      {copied ? (
        <>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copié !
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

export function ShareButton({ code }: { code: string }) {
  const handleShare = async () => {
    const url = `${window.location.origin}/auth/register?ref=${code}`;
    if (navigator.share) {
      await navigator.share({ title: "Rejoins Kiparlo", url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-5 py-3 border-2 border-kiparlo-orange text-kiparlo-orange font-semibold rounded-xl hover:bg-kiparlo-orange hover:text-white transition-colors cursor-pointer"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      Partager
    </button>
  );
}
