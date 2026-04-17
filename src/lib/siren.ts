/**
 * Vérification SIREN/SIRET via l'API Recherche d'entreprises (data.gouv.fr).
 * Gratuite, sans authentification, ~300ms.
 * Doc : https://recherche-entreprises.api.gouv.fr/docs/
 */

export interface SirenVerification {
  siren: string;
  siret: string | null;
  nom: string;
  legal_name: string | null;
  naf: string | null;
  forme_juridique: string | null;
  date_creation: string | null;
  actif: boolean;
  adresse: string | null;
  city: string | null;
  postal_code: string | null;
  dirigeants: { nom: string | null; prenom: string | null; qualite: string | null }[];
}

const API_URL = "https://recherche-entreprises.api.gouv.fr/search";

function cleanDigits(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidSirenOrSiret(input: string): { kind: "siren" | "siret"; value: string } | null {
  const cleaned = cleanDigits(input);
  if (cleaned.length === 9) return { kind: "siren", value: cleaned };
  if (cleaned.length === 14) return { kind: "siret", value: cleaned };
  return null;
}

export async function verifySiren(input: string): Promise<SirenVerification | null> {
  const parsed = isValidSirenOrSiret(input);
  if (!parsed) return null;

  const query = parsed.kind === "siren" ? parsed.value : parsed.value.slice(0, 9);
  const url = `${API_URL}?q=${query}&page=1&per_page=1`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = await res.json();
  const company = data.results?.[0];
  if (!company || company.siren !== query) return null;

  const siege = company.siege ?? {};
  const siret = parsed.kind === "siret" ? parsed.value : siege.siret ?? null;

  return {
    siren: company.siren,
    siret,
    nom: company.nom_complet ?? company.nom_raison_sociale ?? "",
    legal_name: company.nom_raison_sociale ?? null,
    naf: company.activite_principale ?? null,
    forme_juridique: company.nature_juridique ?? null,
    date_creation: company.date_creation ?? null,
    actif: company.etat_administratif === "A",
    adresse: siege.adresse ?? null,
    city: siege.libelle_commune ?? null,
    postal_code: siege.code_postal ?? null,
    dirigeants: Array.isArray(company.dirigeants)
      ? company.dirigeants.map((d: { nom?: string; prenoms?: string; qualite?: string }) => ({
          nom: d.nom ?? null,
          prenom: d.prenoms ?? null,
          qualite: d.qualite ?? null,
        }))
      : [],
  };
}
