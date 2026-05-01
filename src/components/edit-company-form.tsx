"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCompany, requestCompanyModification } from "@/lib/company-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Category {
  id: string;
  name: string;
}

interface Company {
  id: string;
  name: string | null;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  siret: string | null;
  siren: string | null;
  naf_code: string | null;
  insurance_number: string | null;
  category_id: string | null;
}

export function EditCompanyForm({
  company,
  categories,
}: {
  company: Company;
  categories: Category[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: company.name ?? "",
    legal_name: company.legal_name ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    website: company.website ?? "",
    address: company.address ?? "",
    city: company.city ?? "",
    postal_code: company.postal_code ?? "",
    category_id: company.category_id ?? "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Email invalide.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Le téléphone est obligatoire.");
      return;
    }
    if (!form.category_id) {
      setError("La catégorie est obligatoire.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await updateCompany(company.id, form);
    if (result.error) {
      setError("Erreur lors de la sauvegarde. Veuillez réessayer.");
      setSaving(false);
      return;
    }
    router.push("/companies");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Bloc verrouillé : SIRET / SIREN / NAF */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h3 className="text-lg font-semibold text-winelio-dark">
              Informations légales
            </h3>
            <p className="text-xs text-winelio-gray mt-0.5">
              Modifiables uniquement via le support — ces données identifient officiellement votre entreprise.
            </p>
          </div>
          <span className="shrink-0 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full border border-gray-200">
            🔒 Verrouillé
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LockedField label="SIRET" value={company.siret} />
          <LockedField label="SIREN" value={company.siren} />
          <LockedField label="Code NAF/APE" value={company.naf_code} />
        </div>
        <div className="mt-4">
          <LockedField label="N° assurance professionnelle" value={company.insurance_number} />
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setRequestModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-winelio-orange/30 text-winelio-orange text-sm font-medium rounded-xl hover:bg-orange-50 transition-colors"
          >
            ✉️ Demander une modification au support
          </button>
        </div>
      </div>

      <RequestModificationDialog
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        company={company}
      />

      {/* Champs éditables */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-winelio-dark mb-6">
          Informations de l&apos;entreprise
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nom *" name="name" value={form.name} onChange={handleChange} required />
          <Field label="Raison sociale" name="legal_name" value={form.legal_name} onChange={handleChange} />
          <Field label="Email *" name="email" value={form.email} onChange={handleChange} type="email" required />
          <Field label="Téléphone *" name="phone" value={form.phone} onChange={handleChange} required />
          <Field label="Site web" name="website" value={form.website} onChange={handleChange} />
          <Field label="Adresse" name="address" value={form.address} onChange={handleChange} />
          <Field label="Ville" name="city" value={form.city} onChange={handleChange} />
          <Field label="Code postal" name="postal_code" value={form.postal_code} onChange={handleChange} />

          <div>
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              Catégorie *
            </label>
            <select
              name="category_id"
              value={form.category_id}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white"
            >
              <option value="">Sélectionner une catégorie</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/companies")}
            className="px-6 py-3 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </form>
  );
}

function RequestModificationDialog({
  open,
  onClose,
  company,
}: {
  open: boolean;
  onClose: () => void;
  company: Company;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const result = await requestCompanyModification(company.id, reason);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setDone(true);
    setSubmitting(false);
  };

  const handleClose = () => {
    setReason("");
    setError(null);
    setDone(false);
    setSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="!rounded-2xl">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Demande envoyée ✓</DialogTitle>
              <DialogDescription>
                Le support Winelio a bien reçu votre demande et vous répondra à l&apos;adresse de votre compte.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
              >
                Fermer
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Demander une modification</DialogTitle>
              <DialogDescription>
                Précisez ce que vous souhaitez modifier (SIRET, SIREN, code NAF) et pourquoi. Le support Winelio recevra votre demande directement.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 space-y-3">
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-winelio-gray space-y-1">
                <div><strong className="text-winelio-dark">Entreprise :</strong> {company.name ?? "—"}</div>
                <div className="font-mono">SIRET {company.siret ?? "—"} · SIREN {company.siren ?? "—"} · NAF {company.naf_code ?? "—"}</div>
                <div className="font-mono">Assurance pro : {company.insurance_number ?? "—"}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-winelio-gray mb-1">
                  Raison de la demande <span className="text-winelio-orange">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Ex : J'ai changé de SIRET suite à un transfert d'activité, le nouveau est 123 456 789 00012…"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark text-sm focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange resize-none"
                />
                <div className="mt-1 flex justify-between text-xs text-winelio-gray">
                  <span>Minimum 10 caractères. Joignez un justificatif si possible (vous pouvez répondre à l&apos;email du support).</span>
                  <span>{reason.length}/2000</span>
                </div>
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-5 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || reason.trim().length < 10}
                className="px-5 py-2.5 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {submitting ? "Envoi…" : "Envoyer la demande"}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LockedField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <label className="block text-sm font-medium text-winelio-gray mb-1">
        {label}
      </label>
      <div className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-winelio-dark/70 text-sm font-mono">
        {value ?? "—"}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-winelio-gray mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
      />
    </div>
  );
}
