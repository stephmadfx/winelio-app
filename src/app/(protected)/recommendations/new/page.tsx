"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

interface Professional {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
}

type Urgency = "urgent" | "normal" | "flexible";

export default function NewRecommendationPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 - Contact
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [createContact, setCreateContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  // Step 2 - Professional
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [proSearch, setProSearch] = useState("");
  const [selectedProId, setSelectedProId] = useState<string | null>(null);

  // Step 3 - Project
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");

  // Load contacts
  useEffect(() => {
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone")
      .order("last_name")
      .then(({ data }) => setContacts(data ?? []));
  }, [supabase]);

  // Load professionals
  useEffect(() => {
    let query = supabase
      .from("profiles")
      .select("id, first_name, last_name, company:companies(name)")
      .eq("is_professional", true)
      .order("last_name");

    if (proSearch.length >= 2) {
      query = query.or(
        `first_name.ilike.%${proSearch}%,last_name.ilike.%${proSearch}%`
      );
    }

    query.then(({ data }) => {
      setProfessionals(
        (data ?? []).map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          company_name: Array.isArray(p.company)
            ? p.company[0]?.name ?? null
            : (p.company as { name: string } | null)?.name ?? null,
        }))
      );
    });
  }, [proSearch, supabase]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifie");

      let contactId = selectedContactId;

      // Create contact if needed
      if (createContact) {
        const { data: newContact, error: contactErr } = await supabase
          .from("contacts")
          .insert({
            ...contactForm,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (contactErr) throw new Error("Erreur creation contact");
        contactId = newContact.id;
      }

      if (!contactId || !selectedProId) {
        throw new Error("Contact et professionnel requis");
      }

      // Create recommendation
      const { data: recommendation, error: recError } = await supabase
        .from("recommendations")
        .insert({
          referrer_id: user.id,
          professional_id: selectedProId,
          contact_id: contactId,
          description,
          urgency,
          status: "pending",
        })
        .select("id")
        .single();

      if (recError) throw new Error("Erreur creation recommandation");

      // Fetch steps
      const { data: steps } = await supabase
        .from("steps")
        .select("id, step_order, name, description, completion_role")
        .order("step_order");

      if (steps && steps.length > 0) {
        const recSteps = steps.map((s) => ({
          recommendation_id: recommendation.id,
          step_id: s.id,
          step_order: s.step_order,
          completed: false,
          completed_at: null,
          data: null,
        }));

        await supabase.from("recommendation_steps").insert(recSteps);
      }

      router.push(`/recommendations/${recommendation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return selectedContactId !== null || (createContact && contactForm.first_name && contactForm.last_name);
    if (step === 2) return selectedProId !== null;
    if (step === 3) return description.length > 0;
    return false;
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold text-kiparlo-dark">
        Nouvelle recommandation
      </h1>

      {/* Progress */}
      <div className="mb-8 flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-kiparlo-orange" : "bg-kiparlo-gray/20"
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Contact */}
      {step === 1 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-kiparlo-dark">
            1. Selectionner un contact
          </h2>

          {!createContact ? (
            <>
              <div className="mb-4 space-y-2">
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContactId(c.id)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      selectedContactId === c.id
                        ? "border-kiparlo-orange bg-kiparlo-orange/5"
                        : "border-kiparlo-gray/10 bg-white hover:border-kiparlo-orange/30"
                    }`}
                  >
                    <p className="font-medium text-kiparlo-dark">
                      {c.first_name} {c.last_name}
                    </p>
                    <p className="text-sm text-kiparlo-gray">
                      {c.email} {c.phone ? `- ${c.phone}` : ""}
                    </p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setCreateContact(true);
                  setSelectedContactId(null);
                }}
                className="text-sm font-medium text-kiparlo-orange hover:text-kiparlo-amber"
              >
                + Creer un nouveau contact
              </button>
            </>
          ) : (
            <div className="space-y-4 rounded-lg border border-kiparlo-gray/10 bg-white p-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-kiparlo-dark">
                    Prenom *
                  </label>
                  <input
                    type="text"
                    value={contactForm.first_name}
                    onChange={(e) =>
                      setContactForm({ ...contactForm, first_name: e.target.value })
                    }
                    className="w-full rounded-lg border border-kiparlo-gray/20 px-3 py-2 text-sm focus:border-kiparlo-orange focus:outline-none focus:ring-1 focus:ring-kiparlo-orange"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-kiparlo-dark">
                    Nom *
                  </label>
                  <input
                    type="text"
                    value={contactForm.last_name}
                    onChange={(e) =>
                      setContactForm({ ...contactForm, last_name: e.target.value })
                    }
                    className="w-full rounded-lg border border-kiparlo-gray/20 px-3 py-2 text-sm focus:border-kiparlo-orange focus:outline-none focus:ring-1 focus:ring-kiparlo-orange"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-kiparlo-dark">
                  Email
                </label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, email: e.target.value })
                  }
                  className="w-full rounded-lg border border-kiparlo-gray/20 px-3 py-2 text-sm focus:border-kiparlo-orange focus:outline-none focus:ring-1 focus:ring-kiparlo-orange"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-kiparlo-dark">
                  Telephone
                </label>
                <input
                  type="tel"
                  value={contactForm.phone}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, phone: e.target.value })
                  }
                  className="w-full rounded-lg border border-kiparlo-gray/20 px-3 py-2 text-sm focus:border-kiparlo-orange focus:outline-none focus:ring-1 focus:ring-kiparlo-orange"
                />
              </div>
              <button
                onClick={() => {
                  setCreateContact(false);
                  setContactForm({ first_name: "", last_name: "", email: "", phone: "" });
                }}
                className="text-sm text-kiparlo-gray hover:text-kiparlo-dark"
              >
                Retour a la liste
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Professional */}
      {step === 2 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-kiparlo-dark">
            2. Selectionner un professionnel
          </h2>
          <input
            type="text"
            placeholder="Rechercher un professionnel..."
            value={proSearch}
            onChange={(e) => setProSearch(e.target.value)}
            className="mb-4 w-full rounded-lg border border-kiparlo-gray/20 px-4 py-2.5 text-sm focus:border-kiparlo-orange focus:outline-none focus:ring-1 focus:ring-kiparlo-orange"
          />
          <div className="space-y-2">
            {professionals.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProId(p.id)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  selectedProId === p.id
                    ? "border-kiparlo-orange bg-kiparlo-orange/5"
                    : "border-kiparlo-gray/10 bg-white hover:border-kiparlo-orange/30"
                }`}
              >
                <p className="font-medium text-kiparlo-dark">
                  {p.first_name} {p.last_name}
                </p>
                {p.company_name && (
                  <p className="text-sm text-kiparlo-gray">{p.company_name}</p>
                )}
              </button>
            ))}
            {professionals.length === 0 && (
              <p className="py-8 text-center text-sm text-kiparlo-gray">
                Aucun professionnel trouve
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Project */}
      {step === 3 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-kiparlo-dark">
            3. Description du projet
          </h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-kiparlo-dark">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-kiparlo-gray/20 px-4 py-3 text-sm focus:border-kiparlo-orange focus:outline-none focus:ring-1 focus:ring-kiparlo-orange"
                placeholder="Decrivez le besoin du contact..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-kiparlo-dark">
                Niveau d&apos;urgence
              </label>
              <div className="flex gap-3">
                {(
                  [
                    { value: "urgent", label: "Urgent", color: "border-red-400 bg-red-50 text-red-700" },
                    { value: "normal", label: "Normal", color: "border-kiparlo-orange bg-kiparlo-orange/5 text-kiparlo-orange" },
                    { value: "flexible", label: "Flexible", color: "border-green-400 bg-green-50 text-green-700" },
                  ] as const
                ).map((u) => (
                  <button
                    key={u.value}
                    onClick={() => setUrgency(u.value)}
                    className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      urgency === u.value
                        ? u.color
                        : "border-kiparlo-gray/10 bg-white text-kiparlo-gray hover:border-kiparlo-gray/20"
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="rounded-lg border border-kiparlo-gray/20 px-5 py-2.5 text-sm font-medium text-kiparlo-gray hover:border-kiparlo-gray/40 hover:text-kiparlo-dark"
          >
            Retour
          </button>
        ) : (
          <div />
        )}

        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="rounded-lg bg-kiparlo-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-kiparlo-amber disabled:cursor-not-allowed disabled:opacity-50"
          >
            Suivant
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canProceed() || submitting}
            className="rounded-lg bg-kiparlo-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-kiparlo-amber disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Envoi..." : "Envoyer la recommandation"}
          </button>
        )}
      </div>
    </div>
  );
}
