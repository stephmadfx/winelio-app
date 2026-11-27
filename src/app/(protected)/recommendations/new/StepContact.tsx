import { useRef, useState } from "react";
import {
  enrichContactMunicipality,
  mergePhoneContactIntoForm,
  parseVcardText,
  pickPhoneContactInteractive,
} from "./phone-contacts";
import { Contact, ContactFormData, SelfProfile, inputCls } from "./types";

const COUNTRY_CODES = [
  ["+33","FR"],["+32","BE"],["+41","CH"],["+352","LU"],["+377","MC"],
  ["+1","US"],["+44","UK"],["+49","DE"],["+39","IT"],["+34","ES"],
  ["+351","PT"],["+31","NL"],["+212","MA"],["+216","TN"],["+213","DZ"],
  ["+225","CI"],["+221","SN"],["+237","CM"],
] as const;

interface StepContactProps {
  contacts: Contact[];
  selfProfile: SelfProfile | null;
  phoneBookEnabled?: boolean;
  selectedContactId: string | null;
  setSelectedContactId: (id: string | null) => void;
  createContact: boolean;
  setCreateContact: (v: boolean) => void;
  contactForm: ContactFormData;
  setContactForm: (form: ContactFormData) => void;
  contactErrors: Record<string, string>;
  setContactErrors: (e: Record<string, string>) => void;
  thirdPartyConsent: boolean;
  setThirdPartyConsent: (v: boolean) => void;
}

const CheckIcon = () => (
  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const SelectedBadge = () => (
  <div className="w-5 h-5 rounded-full bg-winelio-orange flex items-center justify-center shrink-0">
    <CheckIcon />
  </div>
);

const Initials = ({ name }: { name: string }) => {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  return (
    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center shrink-0">
      <span className="font-bold text-white uppercase text-sm">{init}</span>
    </div>
  );
};

const ThirdPartyConsentCheckbox = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-winelio-orange/20 bg-winelio-orange/5 p-4">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only"
      required
    />
    <div
      aria-hidden="true"
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all ${
        checked
          ? "border-winelio-orange bg-gradient-to-br from-winelio-orange to-winelio-amber"
          : "border-winelio-orange/50 bg-white"
      }`}
    >
      {checked && <CheckIcon />}
    </div>
    <span className="text-sm leading-relaxed text-winelio-dark">
      Je confirme avoir obtenu le consentement explicite de cette personne pour transmettre ses coordonnées à Winelio et au professionnel recommandé afin d&apos;être contactée au sujet de sa demande. <span className="font-semibold text-winelio-orange">Obligatoire</span>
    </span>
  </label>
);

export const StepContact = ({
  contacts, selfProfile, phoneBookEnabled = false,
  selectedContactId, setSelectedContactId,
  createContact, setCreateContact,
  contactForm, setContactForm, contactErrors, setContactErrors,
  thirdPartyConsent, setThirdPartyConsent,
}: StepContactProps) => {
  const vcardInputRef = useRef<HTMLInputElement | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const referrerEmail = selfProfile?.email?.trim().toLowerCase() ?? "";
  const otherContacts = contacts.filter((c) => !referrerEmail || (c.email ?? "").trim().toLowerCase() !== referrerEmail);

  const resetContactForm = () => {
    setCreateContact(false);
    setContactErrors({});
    setImportFeedback(null);
    setThirdPartyConsent(false);
    setContactForm({ first_name: "", last_name: "", email: "", phone: "", country_code: "+33", address: "", city: "", postal_code: "" });
  };

  const setField = (field: keyof ContactFormData, value: string) => {
    setContactForm({ ...contactForm, [field]: value });
    if (contactErrors[field]) setContactErrors({ ...contactErrors, [field]: "" });
  };

  const applyPickedPhoneContact = (picked: Parameters<typeof mergePhoneContactIntoForm>[1]) => {
    if (referrerEmail && picked.email && picked.email.toLowerCase() === referrerEmail) {
      setImportFeedback("Vous ne pouvez pas importer votre propre fiche comme personne recommandée.");
      return;
    }
    const merged = mergePhoneContactIntoForm(contactForm, picked);
    setContactForm(merged);
    setContactErrors({});
    setSelectedContactId(null);
    setCreateContact(true);
    setThirdPartyConsent(false);
    setImportFeedback(null);
  };

  const handleImportFromPhone = async () => {
    setImportFeedback(null);
    const res = await pickPhoneContactInteractive();
    if (res.status === "selected") {
      applyPickedPhoneContact(res.contact);
    } else if (res.status === "needs-vcard") {
      vcardInputRef.current?.click();
    } else if (res.status === "denied") {
      setImportFeedback("Accès au répertoire refusé dans les réglages du téléphone.");
    } else if (res.status === "error") {
      setImportFeedback(res.message);
    }
  };

  const handleVcardFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text().catch(() => "");
    const parsed = parseVcardText(text);
    if (!parsed) {
      setImportFeedback("Ce fichier ne semble pas être une fiche contact (.vcf) valide.");
      return;
    }
    const enriched = await enrichContactMunicipality(parsed);
    applyPickedPhoneContact(enriched);
  };

  return (
    <div>
      <input
        ref={vcardInputRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard"
        onChange={(e) => void handleVcardFileChange(e)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="mb-6">
        <h2 className="text-lg font-bold text-winelio-dark">Qui est le recommandé ?</h2>
        <p className="mt-1 text-sm text-winelio-gray">
          La personne pour qui vous recommandez un professionnel — quelqu&apos;un d&apos;autre, jamais vous-même.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <RoleChip title="Vous" subtitle="Recommandeur" />
          <RoleChip title="Cette personne" subtitle="Recommandé" accent />
          <RoleChip title="Déjà choisi" subtitle="Professionnel" />
        </div>
      </div>

      {importFeedback && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          {importFeedback}
        </div>
      )}

      {!createContact ? (
        <div className="space-y-3">
          <div className={phoneBookEnabled ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-3"}>
            {phoneBookEnabled && (
              <button
                type="button"
                onClick={() => void handleImportFromPhone()}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-winelio-orange/35 bg-winelio-orange/5 px-5 py-4 text-sm font-semibold text-winelio-orange hover:border-winelio-orange hover:bg-winelio-orange/10 transition-all cursor-pointer"
              >
                <svg aria-hidden="true" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                <span>Choisir dans le répertoire</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => { setCreateContact(true); setSelectedContactId(null); setThirdPartyConsent(false); }}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-winelio-orange/40 px-5 py-4 text-sm font-semibold text-winelio-orange hover:border-winelio-orange hover:bg-winelio-orange/5 transition-all cursor-pointer"
            >
              <svg aria-hidden="true" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span>Saisir un nouveau contact</span>
            </button>
          </div>
          {otherContacts.length > 0 && (
            <>
              <Separator />
              <p className="text-xs font-semibold uppercase tracking-widest text-winelio-gray/60">Recommandés existants</p>
              {otherContacts.map((c) => (
                <button key={c.id} type="button" onClick={() => { setSelectedContactId(c.id); setThirdPartyConsent(false); }}
                  className={`w-full flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
                    selectedContactId === c.id
                      ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10"
                      : "border-transparent bg-white hover:border-winelio-orange/20 shadow-sm"
                  }`}>
                  <Initials name={`${c.first_name} ${c.last_name}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-winelio-dark">{c.first_name} {c.last_name}</p>
                    <p className="text-sm text-winelio-gray truncate">{c.email}</p>
                  </div>
                  {selectedContactId === c.id && <SelectedBadge />}
                </button>
              ))}
              {selectedContactId && otherContacts.some((c) => c.id === selectedContactId) && (
                <>
                  <ThirdPartyConsentCheckbox checked={thirdPartyConsent} onChange={setThirdPartyConsent} />
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-winelio-gray/10 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-winelio-dark">Nouveau recommandé</p>
            <div className="flex items-center gap-3">
              {phoneBookEnabled && (
                <button
                  type="button"
                  onClick={() => void handleImportFromPhone()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-winelio-orange/30 bg-winelio-orange/5 px-2.5 py-1.5 text-xs font-semibold text-winelio-orange hover:border-winelio-orange transition-colors cursor-pointer"
                >
                  Répertoire du téléphone
                </button>
              )}
              <button type="button" onClick={resetContactForm} className="text-xs text-winelio-gray hover:text-winelio-dark transition-colors cursor-pointer">Annuler</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="sc-first-name" label="Prénom" error={contactErrors.first_name}>
              <input id="sc-first-name" name="first_name" autoComplete="given-name" required type="text" value={contactForm.first_name} onChange={(e) => setField("first_name", e.target.value)}
                placeholder="Pierre" className={inputCls(!!contactErrors.first_name)} />
            </Field>
            <Field id="sc-last-name" label="Nom" error={contactErrors.last_name}>
              <input id="sc-last-name" name="last_name" autoComplete="family-name" required type="text" value={contactForm.last_name} onChange={(e) => setField("last_name", e.target.value)}
                placeholder="Dupont" className={inputCls(!!contactErrors.last_name)} />
            </Field>
          </div>
          <Field id="sc-email" label="Email" error={contactErrors.email}>
            <input id="sc-email" name="email" autoComplete="email" required type="email" value={contactForm.email} onChange={(e) => setField("email", e.target.value)}
              placeholder="pierre.dupont@email.com" className={inputCls(!!contactErrors.email)} />
          </Field>
          <Field id="sc-phone" label="Téléphone" error={contactErrors.phone}>
            <div className="flex gap-2">
              <label htmlFor="sc-country-code" className="sr-only">Indicatif pays</label>
              <select id="sc-country-code" name="country_code" autoComplete="tel-country-code" value={contactForm.country_code} onChange={(e) => setField("country_code", e.target.value)}
                className="rounded-xl border border-winelio-gray/20 px-2 py-3 text-sm bg-white focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 w-24 shrink-0 cursor-pointer">
                {COUNTRY_CODES.map(([code, label]) => (
                  <option key={code} value={code}>{label} {code}</option>
                ))}
              </select>
              <input id="sc-phone" name="phone" autoComplete="tel-national" inputMode="tel" required type="tel" value={contactForm.phone} onChange={(e) => setField("phone", e.target.value)}
                placeholder="6 12 34 56 78" className={inputCls(!!contactErrors.phone)} />
            </div>
          </Field>
          <Field id="sc-address" label="Adresse" error={contactErrors.address}>
            <input id="sc-address" name="address" autoComplete="street-address" required type="text" value={contactForm.address} onChange={(e) => setField("address", e.target.value)}
              placeholder="123 rue de la Paix" className={inputCls(!!contactErrors.address)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="sc-city" label="Ville" error={contactErrors.city}>
              <input id="sc-city" name="city" autoComplete="address-level2" required type="text" value={contactForm.city} onChange={(e) => setField("city", e.target.value)}
                placeholder="Paris" className={inputCls(!!contactErrors.city)} />
            </Field>
            <Field id="sc-postal-code" label="Code postal" error={contactErrors.postal_code}>
              <input id="sc-postal-code" name="postal_code" autoComplete="postal-code" inputMode="numeric" required type="text" value={contactForm.postal_code} onChange={(e) => setField("postal_code", e.target.value)}
                placeholder="75000" className={inputCls(!!contactErrors.postal_code)} />
            </Field>
          </div>
          <ThirdPartyConsentCheckbox checked={thirdPartyConsent} onChange={setThirdPartyConsent} />
        </div>
      )}
    </div>
  );
};

const RoleChip = ({ title, subtitle, accent }: { title: string; subtitle: string; accent?: boolean }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${accent ? "border-winelio-orange/40 bg-winelio-orange/5" : "border-winelio-gray/15 bg-white"}`}>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-winelio-gray">{subtitle}</p>
    <p className="text-sm font-semibold text-winelio-dark">{title}</p>
  </div>
);

const Separator = () => (
  <div className="relative my-4">
    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-winelio-gray/10" /></div>
    <div className="relative flex justify-center"><span className="bg-winelio-light px-3 text-xs text-winelio-gray">ou</span></div>
  </div>
);

const Field = ({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-winelio-dark">
      {label} <span className="text-winelio-orange">*</span>
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);
