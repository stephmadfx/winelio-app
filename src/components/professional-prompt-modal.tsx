"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Play, X } from "lucide-react";
import { ProOnboardingVideoPlayer } from "@/components/pro-onboarding-video";

const SNOOZE_KEY = "winelio-pro-prompt-snoozed";
const HIDDEN_PATHS = ["/profile", "/profile/pro-onboarding", "/companies", "/settings"];

export function ProfessionalPromptModal({
  delayMs = 20_000,
}: {
  delayMs?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const videoWrapRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [videoMode, setVideoMode] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [saving, setSaving] = useState(false);

  const hiddenOnThisPath = HIDDEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!visible || hiddenOnThisPath) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hiddenOnThisPath, visible]);

  useEffect(() => {
    if (hiddenOnThisPath) return;
    if (typeof window !== "undefined" && sessionStorage.getItem(SNOOZE_KEY) === "1") return;

    const timer = window.setTimeout(() => {
      setVisible(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, hiddenOnThisPath]);

  const persistDismissal = async ({ refresh = true }: { refresh?: boolean } = {}) => {
    setSaving(true);
    try {
      await fetch("/api/profile/pro-prompt", { method: "POST" });
      if (refresh) router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const closePrompt = async () => {
    if (dontShowAgain) {
      setVisible(false);
      await persistDismissal();
    } else if (typeof window !== "undefined") {
      sessionStorage.setItem(SNOOZE_KEY, "1");
      setVisible(false);
    }
  };

  const startVideo = async () => {
    setVideoMode(true);
    setVideoEnded(false);
    void persistDismissal({ refresh: false });
    window.setTimeout(() => {
      videoWrapRef.current?.scrollIntoView({ block: "nearest" });
    }, 80);
  };

  const goToProProfile = () => {
    router.push("/profile/pro-onboarding");
  };

  if (!mounted || !visible || hiddenOnThisPath) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-winelio-dark/80 p-3 backdrop-blur-sm sm:p-4">
      <div className={`relative w-full overflow-hidden bg-white shadow-2xl ${
        videoMode
          ? "flex max-h-[calc(100dvh-1.5rem)] max-w-[min(92vw,420px)] flex-col rounded-2xl sm:max-w-xl sm:rounded-3xl"
          : "max-h-[calc(100dvh-1.5rem)] max-w-4xl overflow-y-auto rounded-3xl"
      }`}>
        <div className="h-1.5 bg-gradient-to-r from-winelio-orange to-winelio-amber" />
        <button
          type="button"
          onClick={closePrompt}
          disabled={saving}
          className="absolute right-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-winelio-dark shadow-lg ring-1 ring-black/10 transition hover:bg-winelio-light disabled:opacity-50 sm:right-4 sm:top-5"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {!videoMode ? (
          <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="relative overflow-hidden bg-winelio-dark p-8 text-white sm:p-10">
              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full border-[42px] border-white/10" />
              <div className="relative z-10 flex h-full min-h-[360px] flex-col justify-between gap-8">
                <div>
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber shadow-lg">
                    <BriefcaseBusiness className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-winelio-amber">Espace professionnel</p>
                  <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
                    Êtes-vous professionnel ?
                  </h2>
                  <p className="mt-4 text-sm leading-6 text-white/75">
                    Si oui, Winelio peut vous guider vers un profil pro validé pour recevoir des recommandations.
                  </p>
                </div>
                <div className="grid gap-3">
                  {["Contacts qualifiés", "Suivi des 8 étapes", "Commissions et Wins automatiques"].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold">
                      <CheckCircle2 className="h-5 w-5 text-winelio-amber" aria-hidden="true" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <div className="rounded-3xl border border-orange-100 bg-orange-50/60 p-5">
                <div className="flex items-start gap-4">
                  <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-winelio-orange shadow-sm">
                    <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-winelio-dark">Vidéo explicative courte</h3>
                    <p className="mt-1 text-sm leading-6 text-winelio-gray">
                      Découvrez les avantages pro, la validation du profil, le parcours de recommandation et la logique des gains.
                    </p>
                  </div>
                </div>
              </div>

              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4 text-sm text-winelio-gray">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(event) => setDontShowAgain(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-winelio-orange focus:ring-winelio-orange"
                />
                <span>
                  <span className="font-semibold text-winelio-dark">Ne plus afficher ce message.</span>
                  <br />
                  Vous pourrez revoir la vidéo depuis le parcours pro.
                </span>
              </label>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={startVideo}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
                >
                  Oui, voir la vidéo
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={closePrompt}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-winelio-dark transition hover:bg-winelio-light disabled:opacity-50"
                >
                  Non merci
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div ref={videoWrapRef} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center bg-winelio-dark p-2 sm:p-3">
              <ProOnboardingVideoPlayer
                autoPlay
                onEnded={() => setVideoEnded(true)}
                className="max-h-[calc(100dvh-13rem)] rounded-xl sm:max-h-[76dvh] sm:rounded-2xl"
              />
            </div>
            <div className="shrink-0 flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5">
              <div>
                <h3 className="text-lg font-bold text-winelio-dark">Prêt à configurer votre profil pro ?</h3>
                <p className="mt-1 text-sm text-winelio-gray">
                  La validation se fait dans le parcours professionnel. Vous ne serez considéré pro qu’une fois le profil validé.
                </p>
              </div>
              <button
                type="button"
                onClick={goToProProfile}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 ${
                  videoEnded
                    ? "bg-gradient-to-r from-winelio-orange to-winelio-amber"
                    : "bg-winelio-dark"
                }`}
              >
                Configurer mon profil pro
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
