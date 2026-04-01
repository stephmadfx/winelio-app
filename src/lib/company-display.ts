export type CompanyForDisplay = {
  name: string;
  alias: string | null;
  category?: string | null;
  city?: string | null;
};

export type CompanyDisplay = {
  /** Texte principal affiché (alias pour users, nom réel pour admins) */
  primary: string;
  /** Sous-texte (alias pour admins, "Catégorie · Ville" pour users) */
  secondary: string | null;
};

/**
 * Retourne l'objet d'affichage selon le rôle.
 * - isAdmin=false → primary: alias (#XXXXXX), secondary: "Catégorie · Ville"
 * - isAdmin=true  → primary: nom complet, secondary: alias + éventuellement "Catégorie · Ville"
 */
export function getCompanyDisplay(
  company: CompanyForDisplay,
  isAdmin: boolean
): CompanyDisplay {
  const alias = company.alias ?? "—";
  const context = [company.category, company.city].filter(Boolean).join(" · ") || null;

  if (isAdmin) {
    return {
      primary: company.name,
      secondary: alias,
    };
  }

  return {
    primary: alias,
    secondary: context,
  };
}
