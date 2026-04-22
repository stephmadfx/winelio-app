"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StickyFormActions } from "@/components/StickyFormActions";
import { Contact, ContactFormData, SelfProfile, Urgency, EMAIL_REGEX, PHONE_REGEX } from "./types";
import { StepProgress } from "./StepProgress";
import { StepContact } from "./StepContact";
import { StepProfessional } from "./StepProfessional";
import { StepProject } from "./StepProject";

export default function NewRecommendationPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [selfForMe, setSelfForMe] = useState(false);
  const [selfProfile, setSelfProfile] = useState<SelfProfile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [createContact, setCreateContact] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormData>({ first_name: "", last_name: "", email: "", phone: "", country_code: "+33", address: "", city: "", postal_code: "" });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [wantsToJoin, setWantsToJoin] = useState(false);

  // Step 2
  const [selectedProId, setSelectedProId] = useState<string | null>(null);

  // Step 3
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");

  useEffect(() => {
    setError(null);
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);
          const { data: profile } = await supabase.schema("winelio").from("profiles").select("first_name, last_name, phone").eq("id", user.id).single();
          if (profile) {
            setSelfProfile({ first_name: profile.first_name ?? "", last_name: profile.last_name ?? "", email: user.email ?? "", phone: profile.phone ?? "" });
          }
        }
      } catch (err) {
        // Silently ignore auth errors on initial load - middleware has already verified session
      }
    };
    loadProfile();

    supabase.from("contacts").select("id, first_name, last_name, email, phone").order("last_name").then(({ data }) => {
      setContacts(data ?? []);
    });
  }, []);

  const validateContact = (): boolean => {
    const errors: Record<string, string> = {};
    if (!contactForm.first_name.trim()) errors.first_name = "Prénom obligatoire";
    if (!contactForm.last_name.trim()) errors.last_name = "Nom obligatoire";
    if (!contactForm.email.trim()) errors.email = "Email obligatoire";
    else if (!EMAIL_REGEX.test(contactForm.email)) errors.email = "Format d'email invalide";
    if (!contactForm.phone.trim()) errors.phone = "Téléphone obligatoire";
    else if (!PHONE_REGEX.test(contactForm.phone)) errors.phone = "Format de téléphone invalide";
    if (!contactForm.address.trim()) errors.address = "Adresse obligatoire";
    if (!contactForm.city.trim()) errors.city = "Ville obligatoire";
    if (!contactForm.postal_code.trim()) errors.postal_code = "Code postal obligatoire";
    setContactErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const canProceed = (): boolean => {
    if (step === 1) return selfForMe || !!selectedContactId || (createContact && !!(contactForm.first_name.trim() && contactForm.last_name.trim() && contactForm.email.trim() && contactForm.phone.trim() && contactForm.address.trim() && contactForm.city.trim() && contactForm.postal_code.trim()));
    if (step === 2) return !!selectedProId;
    return description.length > 0;
  };

  const handleNext = () => {
    if (step === 1 && createContact && !validateContact()) return;
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Erreur authentification: ${authError.message}`);
      if (!user) throw new Error("Session expirée — veuillez vous reconnecter");

      let contactId = selectedContactId;

      if (selfForMe && selfProfile) {
        const { data: existing } = await supabase.schema("winelio").from("contacts").select("id").eq("user_id", user.id).eq("email", selfProfile.email).maybeSingle();
        if (existing) {
          contactId = existing.id;
        } else {
          const { data: newContact, error: err } = await supabase.schema("winelio").from("contacts").insert({ ...selfProfile, user_id: user.id, address: "", city: "", postal_code: "", country: "FR" }).select("id").single();
          if (err) throw new Error("Erreur création contact");
          contactId = newContact.id;
        }
      } else if (createContact) {
        const { country_code, ...contactData } = contactForm;
        const { data: newContact, error: err } = await supabase.schema("winelio").from("contacts").insert({ ...contactData, user_id: user.id, country: "FR" }).select("id").single();
        if (err) throw new Error("Erreur création contact");
        contactId = newContact.id;
      }

      if (!contactId || !selectedProId) throw new Error("Contact et professionnel requis");

      const { data: recommendation, error: recError } = await supabase.from("recommendations").insert({
        referrer_id: user.id, professional_id: selectedProId, contact_id: contactId,
        project_description: description, urgency_level: urgency, status: "PENDING",
      }).select("id").single();

      if (recError) throw new Error("Erreur création recommandation");

      // Envoi invitation Winelio si demandé (fire & forget)
      if (wantsToJoin && !selfForMe) {
        const contactEmail = createContact
          ? contactForm.email
          : contacts.find((c) => c.id === selectedContactId)?.email;
        if (contactEmail) {
          fetch("/api/network/send-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: contactEmail }),
          }).catch((err) => console.error("[send-invite]", err));
        }
      }

      router.push(`/recommendations/${recommendation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
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
        <p className="mt-1 text-sm text-winelio-gray">Mettez en relation un contact avec un professionnel de confiance</p>
      </div>

      <StepProgress currentStep={step} />

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          {error}
        </div>
      )}

      {step === 1 && (
        <StepContact contacts={contacts} selfProfile={selfProfile} selfForMe={selfForMe} setSelfForMe={setSelfForMe}
          selectedContactId={selectedContactId} setSelectedContactId={setSelectedContactId}
          createContact={createContact} setCreateContact={setCreateContact}
          contactForm={contactForm} setContactForm={setContactForm}
          contactErrors={contactErrors} setContactErrors={setContactErrors}
          wantsToJoin={wantsToJoin} setWantsToJoin={setWantsToJoin} />
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
        {step < 3 ? (
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
