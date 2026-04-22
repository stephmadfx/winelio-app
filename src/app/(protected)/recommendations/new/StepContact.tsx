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
  selfForMe: boolean;
  setSelfForMe: (v: boolean) => void;
  selectedContactId: string | null;
  setSelectedContactId: (id: string | null) => void;
  createContact: boolean;
  setCreateContact: (v: boolean) => void;
  contactForm: ContactFormData;
  setContactForm: (form: ContactFormData) => void;
  contactErrors: Record<string, string>;
  setContactErrors: (e: Record<string, string>) => void;
  wantsToJoin: boolean;
  setWantsToJoin: (v: boolean) => void;
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

const JoinNetworkCheckbox = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex items-start gap-3 cursor-pointer mt-4">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only"
    />
    <div
      className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
        checked
          ? "bg-gradient-to-br from-winelio-orange to-winelio-amber border-winelio-orange"
          : "border-gray-300 hover:border-winelio-orange/50"
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
    <span className="text-sm text-winelio-dark leading-relaxed">
      Ce contact souhaite rejoindre le réseau Winelio —{" "}
      <span className="text-winelio-gray">je lui enverrai une invitation par email avec mon code de parrainage.</span>
    </span>
  </label>
);

export const StepContact = ({
  contacts, selfProfile, selfForMe, setSelfForMe,
  selectedContactId, setSelectedContactId,
  createContact, setCreateContact,
  contactForm, setContactForm, contactErrors, setContactErrors,
  wantsToJoin, setWantsToJoin,
}: StepContactProps) => {
  const resetContactForm = () => {
    setCreateContact(false);
    setContactErrors({});
    setContactForm({ first_name: "", last_name: "", email: "", phone: "", country_code: "+33", address: "", city: "", postal_code: "" });
  };

  const setField = (field: keyof ContactFormData, value: string) => {
    setContactForm({ ...contactForm, [field]: value });
    if (contactErrors[field]) setContactErrors({ ...contactErrors, [field]: "" });
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-winelio-dark">Qui a besoin d&apos;un professionnel ?</h2>
        <p className="mt-1 text-sm text-winelio-gray">Vous-même, ou quelqu&apos;un que vous souhaitez mettre en relation.</p>
      </div>

      {!createContact ? (
        <div className="space-y-3">
          {contacts.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-winelio-gray/60">Contacts existants</p>
              {contacts.map((c) => (
                <button key={c.id} onClick={() => { setSelectedContactId(c.id); setSelfForMe(false); setWantsToJoin(false); }}
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
              {selectedContactId && contacts.some((c) => c.id === selectedContactId) && (
                <JoinNetworkCheckbox checked={wantsToJoin} onChange={setWantsToJoin} />
              )}
              <Separator />
            </>
          )}

          <button onClick={() => { setCreateContact(true); setSelectedContactId(null); setSelfForMe(false); setWantsToJoin(false); }}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-winelio-orange/40 px-5 py-4 text-sm font-semibold text-winelio-orange hover:border-winelio-orange hover:bg-winelio-orange/5 transition-all cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Ajouter un nouveau contact
          </button>

          <Separator />

          <button onClick={() => { setSelfForMe(!selfForMe); setSelectedContactId(null); }}
            className={`w-full flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
              selfForMe
                ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10"
                : "border-winelio-gray/15 bg-white hover:border-winelio-orange/30 shadow-sm"
            }`}>
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-winelio-dark">Pour moi-même</p>
              {selfProfile && (
                <p className="text-sm text-winelio-gray truncate">{selfProfile.first_name} {selfProfile.last_name} · {selfProfile.email}</p>
              )}
            </div>
            {selfForMe && <SelectedBadge />}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-winelio-gray/10 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-winelio-dark">Nouveau contact</p>
            <button onClick={resetContactForm} className="text-xs text-winelio-gray hover:text-winelio-dark transition-colors cursor-pointer">Annuler</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Prénom" error={contactErrors.first_name}>
              <input type="text" value={contactForm.first_name} onChange={(e) => setField("first_name", e.target.value)}
                placeholder="Pierre" className={inputCls(!!contactErrors.first_name)} />
            </Field>
            <Field label="Nom" error={contactErrors.last_name}>
              <input type="text" value={contactForm.last_name} onChange={(e) => setField("last_name", e.target.value)}
                placeholder="Dupont" className={inputCls(!!contactErrors.last_name)} />
            </Field>
          </div>
          <Field label="Email" error={contactErrors.email}>
            <input type="email" value={contactForm.email} onChange={(e) => setField("email", e.target.value)}
              placeholder="pierre.dupont@email.com" className={inputCls(!!contactErrors.email)} />
          </Field>
          <Field label="Téléphone" error={contactErrors.phone}>
            <div className="flex gap-2">
              <select value={contactForm.country_code} onChange={(e) => setField("country_code", e.target.value)}
                className="rounded-xl border border-winelio-gray/20 px-2 py-3 text-sm bg-white focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 w-24 shrink-0 cursor-pointer">
                {COUNTRY_CODES.map(([code, label]) => (
                  <option key={code} value={code}>{label} {code}</option>
                ))}
              </select>
              <input type="tel" value={contactForm.phone} onChange={(e) => setField("phone", e.target.value)}
                placeholder="6 12 34 56 78" className={inputCls(!!contactErrors.phone)} />
            </div>
          </Field>
          <Field label="Adresse" error={contactErrors.address}>
            <input type="text" value={contactForm.address} onChange={(e) => setField("address", e.target.value)}
              placeholder="123 rue de la Paix" className={inputCls(!!contactErrors.address)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ville" error={contactErrors.city}>
              <input type="text" value={contactForm.city} onChange={(e) => setField("city", e.target.value)}
                placeholder="Paris" className={inputCls(!!contactErrors.city)} />
            </Field>
            <Field label="Code postal" error={contactErrors.postal_code}>
              <input type="text" value={contactForm.postal_code} onChange={(e) => setField("postal_code", e.target.value)}
                placeholder="75000" className={inputCls(!!contactErrors.postal_code)} />
            </Field>
          </div>
          <JoinNetworkCheckbox checked={wantsToJoin} onChange={setWantsToJoin} />
        </div>
      )}
    </div>
  );
};

const Separator = () => (
  <div className="relative my-4">
    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-winelio-gray/10" /></div>
    <div className="relative flex justify-center"><span className="bg-winelio-light px-3 text-xs text-winelio-gray">ou</span></div>
  </div>
);

const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1.5 block text-sm font-medium text-winelio-dark">
      {label} <span className="text-winelio-orange">*</span>
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);
