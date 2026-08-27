"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StickyFormActions } from "@/components/StickyFormActions";
import { BeneficiaryChoice, SelfProfile, Urgency } from "./types";
import { StepProgress } from "./StepProgress";
import { StepContact } from "./StepContact";
import { StepProfessional } from "./StepProfessional";
import { StepProject } from "./StepProject";

export default function NewRecommendationPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [selfProfile, setSelfProfile] = useState<SelfProfile | null>(null);
  const [sponsorCode, setSponsorCode] = useState("");
  const [beneficiaryChoice, setBeneficiaryChoice] = useState<BeneficiaryChoice | null>(null);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2
  const [selectedProId, setSelectedProId] = useState<string | null>(null);

  // Step 3
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");

  useEffect(() => {
    setError(null);
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/auth/whoami");
        if (!res.ok) {
          setError("Erreur authentification: session introuvable");
          return;
        }
        const { user } = await res.json();
        if (user?.id) {
          setUserId(user.id);
          const { data: profile } = await supabase.schema("winelio").from("profiles").select("first_name, last_name, phone, sponsor_code").eq("id", user.id).single();
          if (profile) {
            setSelfProfile({ first_name: profile.first_name ?? "", last_name: profile.last_name ?? "", email: user.email ?? "", phone: profile.phone ?? "" });
            setSponsorCode(profile.sponsor_code ?? "");
          }
        } else {
          setError("Erreur authentification: Aucun utilisateur trouvé");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Erreur lors du chargement du profil: ${msg}`);
      }
    };
    loadProfile();
  }, []);

  const canProceed = (): boolean => {
    if (step === 1) return beneficiaryChoice === "self" && selfProfile !== null;
    if (step === 2) return !!selectedProId;
    return description.length > 0;
  };

  const handleNext = () => {
    if (!canProceed()) return;
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedProId,
          description,
          urgency,
          selfForMe: true,
        }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Erreur lors de la création");

      const recommendation = payload.recommendation;

      router.push(`/recommendations/${recommendation.id}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erreur inconnue";
      console.error("[handleSubmit] Error occurred:", errorMsg, err);
      setError(errorMsg);
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-24 lg:pb-0">
      <div className="mb-8">
        <button onClick={() => router.push("/recommendations")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-winelio-gray hover:text-winelio-dark transition-colors cursor-pointer">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>
        <h1 className="text-2xl font-bold text-winelio-dark tracking-tight">Nouvelle recommandation</h1>
        <p className="mt-1 text-sm text-winelio-gray">Trouvez un professionnel de confiance — pour vous ou en invitant un proche</p>
      </div>

      <StepProgress currentStep={step} />

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          {error}
        </div>
      )}

      {step === 1 && (
        <StepContact
          selfProfile={selfProfile}
          sponsorCode={sponsorCode}
          beneficiaryChoice={beneficiaryChoice}
          onChoose={setBeneficiaryChoice}
        />
      )}
      {step === 2 && <StepProfessional userId={userId} selectedProId={selectedProId} onSelect={setSelectedProId} />}
      {step === 3 && <StepProject description={description} urgency={urgency} onDescriptionChange={setDescription} onUrgencyChange={setUrgency} />}

      <StickyFormActions>
        {step > 1 ? (
          <button onClick={() => setStep(step - 1)}
            className="inline-flex items-center gap-2 rounded-xl border border-winelio-gray/20 px-5 py-2.5 text-sm font-semibold text-winelio-gray hover:border-winelio-gray/40 hover:text-winelio-dark transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Retour
          </button>
        ) : <div />}
        {step === 1 && beneficiaryChoice === "other" ? (
          <div />
        ) : step < 3 ? (
          <button onClick={handleNext} disabled={!canProceed()}
            className="inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:bg-winelio-amber hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none cursor-pointer">
            Suivant
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={!canProceed() || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:bg-winelio-amber hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none cursor-pointer">
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Envoi en cours...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>Envoyer la recommandation</>
            )}
          </button>
        )}
      </StickyFormActions>
    </div>
  );
}
