"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StickyFormActions } from "@/components/StickyFormActions";
import { Contact, ContactFormData, Professional, SelfProfile, Urgency, EMAIL_REGEX, PHONE_REGEX } from "./types";
import { StepProgress } from "./StepProgress";
import { StepContact } from "./StepContact";
import { StepProfessional } from "./StepProfessional";
import { StepProject } from "./StepProject";
import { AiRecommendationAssistant } from "./AiRecommendationAssistant";

type EntryMode = "classic" | "ai";

export default function NewRecommendationPage() {
  const router = useRouter();

  const [aiEnabled, setAiEnabled] = useState(false);
  const [mode, setMode] = useState<EntryMode>("classic");
  const classicTabRef = useRef<HTMLButtonElement | null>(null);
  const aiTabRef = useRef<HTMLButtonElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [selfProfile, setSelfProfile] = useState<SelfProfile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [createContact, setCreateContact] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormData>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    country_code: "+33",
    address: "",
    city: "",
    postal_code: "",
  });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [thirdPartyConsent, setThirdPartyConsent] = useState(false);

  const [selectedProId, setSelectedProId] = useState<string | null>(null);
  const [selectedProMeta, setSelectedProMeta] = useState<Professional | null>(null);

  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");

  useEffect(() => {
    let active = true;
    fetch("/api/recommendations/options", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      })
      .then((body) => {
        if (!active) return;
        setUserId(body.userId);
        setSelfProfile(body.profile);
        setContacts(body.contacts ?? []);
        if (body.aiAssistantEnabled) {
          setAiEnabled(true);
          setMode("ai");
        }
      })
      .catch((error) => {
        if (active) setError(error.message || "Impossible de charger vos contacts.");
      });
    return () => {
      active = false;
    };
  }, []);

  const ownEmail = selfProfile?.email.trim().toLowerCase() ?? "";

  const validateContact = (): boolean => {
    const errors: Record<string, string> = {};
    if (!contactForm.first_name.trim()) errors.first_name = "Prénom obligatoire";
    if (!contactForm.last_name.trim()) errors.last_name = "Nom obligatoire";
    if (!contactForm.email.trim()) errors.email = "Email obligatoire";
    else if (!EMAIL_REGEX.test(contactForm.email)) errors.email = "Format d'email invalide";
    else if (ownEmail && contactForm.email.trim().toLowerCase() === ownEmail) {
      errors.email = "Le recommandé ne peut pas être vous-même";
    }
    if (!contactForm.phone.trim()) errors.phone = "Téléphone obligatoire";
    else if (!PHONE_REGEX.test(contactForm.phone)) errors.phone = "Format de téléphone invalide";
    if (!contactForm.address.trim()) errors.address = "Adresse obligatoire";
    if (!contactForm.city.trim()) errors.city = "Ville obligatoire";
    if (!contactForm.postal_code.trim()) errors.postal_code = "Code postal obligatoire";
    setContactErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const contactReady =
    thirdPartyConsent &&
    (!!selectedContactId ||
      (createContact &&
        !!(
          contactForm.first_name.trim() &&
          contactForm.last_name.trim() &&
          contactForm.email.trim() &&
          contactForm.phone.trim() &&
          contactForm.address.trim() &&
          contactForm.city.trim() &&
          contactForm.postal_code.trim()
        ) &&
        (!ownEmail || contactForm.email.trim().toLowerCase() !== ownEmail)));

  const allReady = !!selectedProId && description.trim().length > 0 && contactReady;

  const canProceed = (): boolean => {
    if (step === 1) return !!selectedProId;
    if (step === 2) return description.trim().length > 0;
    return allReady;
  };

  const handleNext = () => {
    if (!canProceed()) return;
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (submitting || !allReady) return;
    if (createContact && !validateContact()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { country_code, ...contactFormClean } = contactForm;
      const res = await fetch("/api/recommendations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedContactId,
          selectedProId,
          description,
          urgency,
          createContact,
          thirdPartyConsent,
          contactForm: createContact ? contactFormClean : null,
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

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const nextMode: EntryMode = mode === "classic" ? "ai" : "classic";
      setMode(nextMode);
      if (nextMode === "classic") classicTabRef.current?.focus();
      else aiTabRef.current?.focus();
    }
  };

  return (
    <div className="pb-28 lg:pb-0">
      <div className={mode === "ai" ? "mb-3 sm:mb-6" : "mb-5 sm:mb-6"}>
        <button
          type="button"
          onClick={() => router.push("/recommendations")}
          className="mb-2 sm:mb-3 inline-flex items-center gap-1.5 py-1 text-sm text-winelio-gray hover:text-winelio-dark transition-colors cursor-pointer"
        >
          <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-winelio-dark tracking-tight">Nouvelle recommandation</h1>
        <p className={`mt-1 text-xs sm:text-sm text-winelio-gray leading-relaxed ${mode === "ai" ? "hidden sm:block" : ""}`}>
          {aiEnabled
            ? "Laissez-vous guider à la voix par l'assistant IA ou remplissez votre recommandation étape par étape."
            : "Remplissez votre recommandation étape par étape."}
        </p>

        {/* Sélecteur de mode accessible : affiché uniquement pour les comptes autorisés */}
        {aiEnabled && (
          <div
            role="tablist"
            aria-label="Mode de saisie de la recommandation"
            onKeyDown={handleTabKeyDown}
            className="mt-2.5 sm:mt-5 flex overflow-x-auto border-b border-winelio-gray/15 gap-1 sm:gap-2"
          >
            <button
              ref={aiTabRef}
              id="tab-mode-ai"
              type="button"
              role="tab"
              aria-selected={mode === "ai"}
              tabIndex={mode === "ai" ? 0 : -1}
              onClick={() => setMode("ai")}
              className="relative flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold whitespace-nowrap text-winelio-gray aria-selected:text-winelio-orange after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-transparent aria-selected:after:border-winelio-orange transition-colors cursor-pointer"
            >
              <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              <span>Assistant vocal IA</span>
            </button>

            <button
              ref={classicTabRef}
              id="tab-mode-classic"
              type="button"
              role="tab"
              aria-selected={mode === "classic"}
              tabIndex={mode === "classic" ? 0 : -1}
              onClick={() => setMode("classic")}
              className="relative flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 text-xs sm:text-sm font-semibold whitespace-nowrap text-winelio-gray aria-selected:text-winelio-orange after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-transparent aria-selected:after:border-winelio-orange transition-colors cursor-pointer"
            >
              <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
              </svg>
              <span>Formulaire classique</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          <svg aria-hidden="true" className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {/* Panneau 1 : Assistant vocal IA hybride (uniquement comptes autorisés) */}
      {aiEnabled && (
        <div role="tabpanel" aria-labelledby="tab-mode-ai" hidden={mode !== "ai"}>
          <div>
            <AiRecommendationAssistant
              contacts={contacts}
              selfProfile={selfProfile}
              selectedProId={selectedProId}
              selectedProMeta={selectedProMeta}
              onSelectPro={(id, pro) => {
                setSelectedProId(id);
                setSelectedProMeta(pro ?? null);
              }}
              description={description}
              onDescriptionChange={setDescription}
              urgency={urgency}
              onUrgencyChange={setUrgency}
              selectedContactId={selectedContactId}
              setSelectedContactId={setSelectedContactId}
              createContact={createContact}
              setCreateContact={setCreateContact}
              contactForm={contactForm}
              setContactForm={setContactForm}
              contactErrors={contactErrors}
              setContactErrors={setContactErrors}
              thirdPartyConsent={thirdPartyConsent}
              setThirdPartyConsent={setThirdPartyConsent}
              canSubmit={allReady}
              submitting={submitting}
              onSubmit={handleSubmit}
              onSwitchToClassicStep={(targetStep) => {
                setStep(targetStep);
                setMode("classic");
              }}
            />
          </div>
        </div>
      )}

      {/* Panneau 2 : Formulaire classique existant */}
      <div role="tabpanel" aria-labelledby="tab-mode-classic" hidden={aiEnabled && mode !== "classic"}>
        <div>
          <StepProgress currentStep={step} />

          <div hidden={step !== 1}>
            <StepProfessional
              userId={userId}
              selectedProId={selectedProId}
              onSelect={(id, pro) => {
                setSelectedProId(id);
                if (pro) setSelectedProMeta(pro);
                setStep(2);
              }}
            />
          </div>
          {step === 3 && (
            <StepContact
              contacts={contacts}
              selfProfile={selfProfile}
              phoneBookEnabled={aiEnabled}
              selectedContactId={selectedContactId}
              setSelectedContactId={setSelectedContactId}
              createContact={createContact}
              setCreateContact={setCreateContact}
              contactForm={contactForm}
              setContactForm={setContactForm}
              contactErrors={contactErrors}
              setContactErrors={setContactErrors}
              thirdPartyConsent={thirdPartyConsent}
              setThirdPartyConsent={setThirdPartyConsent}
            />
          )}
          {step === 2 && (
            <StepProject
              description={description}
              urgency={urgency}
              onDescriptionChange={setDescription}
              onUrgencyChange={setUrgency}
            />
          )}

          <StickyFormActions>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="inline-flex items-center gap-2 rounded-xl border border-winelio-gray/20 px-5 py-2.5 text-sm font-semibold text-winelio-gray hover:border-winelio-gray/40 hover:text-winelio-dark transition-colors cursor-pointer"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Retour
              </button>
            ) : (
              <div />
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className="inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:bg-winelio-amber hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none cursor-pointer"
              >
                Suivant
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canProceed() || submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:bg-winelio-amber hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                    Envoyer la recommandation
                  </>
                )}
              </button>
            )}
          </StickyFormActions>
        </div>
      </div>
    </div>
  );
}
