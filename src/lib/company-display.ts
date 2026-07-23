export type CompanyForDisplay = {
  name: string;
  category?: string | null;
  city?: string | null;
};

export type CompanyDisplay = {
  /** Nom réel de l'entreprise. */
  primary: string;
  /** Contexte métier et géographique. */
  secondary: string | null;
};

/**
 * Les alias historiques #XXXXXX ne sont plus exposés dans l'interface.
 */
export function getCompanyDisplay(
  company: CompanyForDisplay,
  _isAdmin: boolean
): CompanyDisplay {
  const context = [company.category, company.city].filter(Boolean).join(" · ") || null;
  return {
    primary: company.name,
    secondary: context,
  };
}
