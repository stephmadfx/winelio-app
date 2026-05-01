// src/components/ProOnboardingWizard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { completeProOnboarding } from "@/app/(protected)/profile/actions";
import { verifySiren, isValidSirenOrSiret, type SirenVerification } from "@/lib/siren";
import { checkNafCode, type NafCheckResult } from "@/lib/naf-rules";

const SignatureModal = dynamic(() => import("@/components/SignatureModal"), { ssr: false });

type WorkMode = "remote" | "onsite" | "both";

interface Category {
  id: string;
  name: string;
  is_hoguet: boolean;
}

interface Props {
  categories: Category[];
  defaultSiret: string;
  defaultCategoryId: string;
  cguAgentsImmoDocumentId: string | null;
  cguAgentsImmoSections: { article_number: string; title: string; content: string }[];
}

const WORK_MODES: { value: WorkMode; label: string; sub: string; icon: string }[] = [
  { value: "remote",  label: "Distanciel", sub: "En ligne",    icon: "💻" },
  { value: "onsite",  label: "Présentiel", sub: "En personne", icon: "🤝" },
  { value: "both",    label: "Les deux",   sub: "Flexible",    icon: "🌍" },
];

export function ProOnboardingWizard({
  categories,
  defaultSiret,
  defaultCategoryId,
  cguAgentsImmoDocumentId,
  cguAgentsImmoSections,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workMode, setWorkMode] = useState<WorkMode | null>(null);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [siret, setSiret] = useState(defaultSiret);
  const [sirenData, setSirenData] = useState<SirenVerification | null>(null);
  const [nafCheck, setNafCheck] = useState<NafCheckResult | null>(null);
  const [proEmail, setProEmail] = useState("");
  const [insuranceNumber, setInsuranceNumber] = useState("");
  const [engagementChecked, setEngagementChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  const isHoguet = categories.find((c) => c.id === categoryId)?.is_hoguet ?? false;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const result = await completeProOnboarding({
      work_mode: workMode!,
      category_id: categoryId,
      siret: siret.trim() || null,
      email: proEmail.trim() || null,
      insurance_number: insuranceNumber.trim() || null,
    });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push("/profile?pro=1");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Barre de progression */}
      <StepBar current={step} />

      {/* Étape 1 */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <span className="inline-block bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
            ÉTAPE 1 / 3
          </span>
          <h2 className="text-xl font-bold text-winelio-dark mb-1">Comment tu travailles avec tes clients ?</h2>
          <p className="text-sm text-winelio-gray mb-6">Cela aide tes futurs clients à savoir comment te contacter.</p>
          <div className="grid grid-cols-3 gap-3">
            {WORK_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setWorkMode(m.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  workMode === m.value
                    ? "border-winelio-orange bg-orange-50"
                    : "border-gray-200 hover:border-winelio-orange/40"
                }`}
              >
                <span className="text-3xl">{m.icon}</span>
                <span className={`text-sm font-semibold ${workMode === m.value ? "text-winelio-orange" : "text-winelio-dark"}`}>
                  {m.label}
                </span>
                <span className="text-xs text-winelio-gray">{m.sub}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={!workMode}
              onClick={() => setStep(2)}
              className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}

      {/* Étape 2 */}
      {step === 2 && (
        <Step2
          categories={categories}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          siret={siret}
          setSiret={setSiret}
          sirenData={sirenData}
          setSirenData={setSirenData}
          nafCheck={nafCheck}
          setNafCheck={setNafCheck}
          proEmail={proEmail}
          setProEmail={setProEmail}
          insuranceNumber={insuranceNumber}
          setInsuranceNumber={setInsuranceNumber}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {/* Étape 3 */}
      {step === 3 && (
        <Step3
          isHoguet={isHoguet}
          checked={engagementChecked}
          setChecked={setEngagementChecked}
          saving={saving}
          error={error}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          onOpenSignature={() => setShowSignatureModal(true)}
        />
      )}

      {/* Modale signature CGU Agents Immobiliers */}
      {showSignatureModal && cguAgentsImmoDocumentId && (
        <SignatureModal
          cguDocumentId={cguAgentsImmoDocumentId}
          sections={cguAgentsImmoSections}
          onClose={() => setShowSignatureModal(false)}
        />
      )}
    </div>
  );
}

/* ── Barre de progression ── */
function StepBar({ current }: { current: number }) {
  const steps = ["Mon activité", "Mon entreprise", "Engagement"];
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={n} className="flex-1 flex flex-col items-center gap-1 relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                done
                  ? "bg-green-500 text-white"
                  : active
                  ? "bg-gradient-to-br from-winelio-orange to-winelio-amber text-white"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {done ? "✓" : n}
            </div>
            <span className={`text-xs font-medium ${active ? "text-winelio-orange" : "text-gray-400"}`}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`absolute top-4 left-1/2 w-full h-0.5 -z-10 ${done ? "bg-green-400" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Étape 2 ── */
function Step2({
  categories, categoryId, setCategoryId, siret, setSiret,
  sirenData, setSirenData, nafCheck, setNafCheck,
  proEmail, setProEmail, insuranceNumber, setInsuranceNumber,
  onBack, onNext,
}: {
  categories: Category[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  siret: string;
  setSiret: (v: string) => void;
  sirenData: SirenVerification | null;
  setSirenData: (v: SirenVerification | null) => void;
  nafCheck: NafCheckResult | null;
  setNafCheck: (v: NafCheckResult | null) => void;
  proEmail: string;
  setProEmail: (v: string) => void;
  insuranceNumber: string;
  setInsuranceNumber: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyError(null);
    setSirenData(null);
    setNafCheck(null);
    try {
      const data = await verifySiren(siret);
      if (!data) {
        setVerifyError("SIRET introuvable dans le registre des entreprises.");
      } else {
        setSirenData(data);
        const naf = checkNafCode(data.naf);
        setNafCheck(naf);
        if (!data.actif) {
          setVerifyError("⚠️ Cette entreprise est cessée ou radiée.");
        } else if (!naf.allowed) {
          setVerifyError(naf.reason);
        }
        if (data.siret) setSiret(data.siret);
      }
    } catch {
      setVerifyError("Erreur de connexion au service de vérification.");
    } finally {
      setVerifying(false);
    }
  };

  const canContinue =
    !!categoryId &&
    !!siret.trim() &&
    !!sirenData &&
    sirenData.actif &&
    !!nafCheck &&
    nafCheck.allowed;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <span className="inline-block bg-gray-200 text-gray-500 text-xs font-bold px-3 py-1 rounded-full mb-3">
        ÉTAPE 2 / 3
      </span>
      <h2 className="text-xl font-bold text-winelio-dark mb-6">Ton activité professionnelle</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            Catégorie d&apos;activité <span className="text-winelio-orange">*</span>
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white"
          >
            <option value="">Sélectionner une catégorie…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            Numéro SIRET <span className="text-winelio-orange">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={siret}
              onChange={(e) => {
                setSiret(e.target.value);
                setSirenData(null);
                setNafCheck(null);
                setVerifyError(null);
              }}
              placeholder="123 456 789 00012"
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
            />
            <button
              type="button"
              onClick={handleVerify}
              disabled={!isValidSirenOrSiret(siret) || verifying}
              className="px-4 py-2.5 bg-winelio-dark text-white text-sm font-semibold rounded-xl hover:bg-winelio-dark/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {verifying ? "…" : "Vérifier"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-winelio-gray">
            Ton activité doit être une prestation de service pour activer un compte pro.
          </p>
          {sirenData && sirenData.actif && nafCheck?.allowed && (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm">
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <div>
                  <div className="font-semibold text-green-800">{sirenData.nom}</div>
                  <div className="text-xs text-green-600 mt-1">
                    Active — SIREN {sirenData.siren} — NAF {nafCheck.code}
                  </div>
                </div>
              </div>
            </div>
          )}
          {verifyError && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {verifyError}
              {nafCheck && !nafCheck.allowed && (
                <div className="mt-1.5 text-xs text-red-600">
                  Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez le support.
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            Email professionnel <span className="text-winelio-gray/50 text-xs font-normal">(optionnel)</span>
          </label>
          <input
            type="email"
            value={proEmail}
            onChange={(e) => setProEmail(e.target.value)}
            placeholder="contact@monentreprise.fr"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
          />
          <p className="mt-1.5 text-xs text-winelio-gray">
            C&apos;est l&apos;adresse où tu seras contacté lors d&apos;une nouvelle recommandation. Si non renseigné, ton email de connexion Winelio est utilisé.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            Numéro d&apos;assurance professionnelle <span className="text-winelio-gray/50 text-xs font-normal">(optionnel)</span>
          </label>
          <input
            type="text"
            value={insuranceNumber}
            onChange={(e) => setInsuranceNumber(e.target.value)}
            placeholder="N° contrat RC pro"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
          />
          <p className="mt-1.5 text-xs text-winelio-gray">
            Renseigner l&apos;assurance responsabilité civile pro rassure les clients qui te seront recommandés. Une fois saisi, ce champ ne pourra être modifié que via le support.
          </p>
        </div>
      </div>
      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          ← Retour
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={onNext}
          className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}

/* ── Étape 3 ── */
function Step3({
  isHoguet, checked, setChecked, saving, error, onBack, onSubmit, onOpenSignature,
}: {
  isHoguet: boolean;
  checked: boolean;
  setChecked: (v: boolean) => void;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
  onOpenSignature: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <span className="inline-block bg-gray-200 text-gray-500 text-xs font-bold px-3 py-1 rounded-full mb-3">
        ÉTAPE 3 / 3
      </span>
      <h2 className="text-xl font-bold text-winelio-dark mb-1">Tu as tout à gagner 🚀</h2>

      {isHoguet ? (
        <>
          <p className="text-sm text-winelio-gray mb-4">
            En tant qu&apos;agent immobilier (loi Hoguet), tu dois signer électroniquement les CGU spécifiques à ton activité pour activer ton compte Pro.
          </p>
          <div className="bg-orange-50 border-l-4 border-winelio-orange rounded-r-xl p-4 mb-5 text-sm text-winelio-dark leading-relaxed">
            Les CGU Agents Immobiliers encadrent l&apos;utilisation de la plateforme Winelio conformément à la loi Hoguet et aux obligations réglementaires de la profession. Une signature électronique avec horodatage certifié te sera demandée.
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-winelio-gray mb-4">Lis et accepte cet engagement pour activer ton compte Pro.</p>
          <div className="bg-orange-50 border-l-4 border-winelio-orange rounded-r-xl p-4 mb-5 text-sm text-winelio-dark leading-relaxed">
            Je m&apos;engage à traiter chaque recommandation avec sérieux et réactivité. Je comprends que chaque lead
            Winelio est une opportunité concrète d&apos;augmenter mon chiffre d&apos;affaires. Je m&apos;engage à suivre
            l&apos;avancement de chaque mission directement via l&apos;application Winelio, car c&apos;est ce qui me
            garantit d&apos;être recommandé à nouveau, de gagner en visibilité et de fidéliser ma clientèle sur le
            long terme.
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <div
              onClick={() => setChecked(!checked)}
              className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
                checked
                  ? "bg-gradient-to-br from-winelio-orange to-winelio-amber border-winelio-orange"
                  : "border-gray-300"
              }`}
            >
              {checked && <span className="text-white text-xs font-bold">✓</span>}
            </div>
            <span className="text-sm text-winelio-dark font-medium">
              J&apos;ai lu et j&apos;accepte cet engagement — je suis prêt à booster mon activité avec Winelio.
            </span>
          </label>
        </>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="mt-6 flex justify-between items-center">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          ← Retour
        </button>
        {isHoguet ? (
          <button
            type="button"
            onClick={onOpenSignature}
            className="px-7 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-bold rounded-xl shadow-lg shadow-orange-200 hover:opacity-90 transition-opacity text-base"
          >
            ✍️ Signer les CGU
          </button>
        ) : (
          <button
            type="button"
            disabled={!checked || saving}
            onClick={onSubmit}
            className="px-7 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-bold rounded-xl shadow-lg shadow-orange-200 hover:opacity-90 transition-opacity disabled:opacity-40 text-base"
          >
            {saving ? "Activation…" : "🚀 Devenir Pro !"}
          </button>
        )}
      </div>
    </div>
  );
}
