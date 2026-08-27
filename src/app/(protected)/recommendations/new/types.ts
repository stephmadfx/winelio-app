export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export interface Professional {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  category_name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  avg_rating: number | null;
  review_count: number;
  is_claimed: boolean;
  last_active_at: string;
  company_source?: string | null;
  company_description?: string | null;
  /**
   * Ce que vaut la position de la fiche : `housenumber` / `street` proviennent
   * d'un géocodage à l'adresse, `municipality` n'est que le centre de la commune,
   * partagé par toutes les entreprises de la ville. Seuls les deux premiers
   * autorisent l'affichage d'une distance.
   */
  geo_precision?: "housenumber" | "street" | "municipality" | null;
}

/** Une distance n'a de sens que si la fiche est située à l'adresse. */
export const hasPreciseLocation = (p: Professional): boolean =>
  p.geo_precision === "housenumber" || p.geo_precision === "street";

export interface Category {
  id: string;
  name: string;
}

export interface SelfProfile {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country_code: string;
  address: string;
  city: string;
  postal_code: string;
}

export type Urgency = "urgent" | "normal" | "flexible";

export const STEPS_META = [
  { number: 1, label: "Recommandé" },
  { number: 2, label: "Professionnel" },
  { number: 3, label: "Projet" },
] as const;

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[0-9\s\-().+]{6,20}$/;

export const inputCls = (hasError?: boolean) =>
  `w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors ${
    hasError
      ? "border-red-400 focus:border-red-400 focus:ring-red-100"
      : "border-winelio-gray/20 focus:border-winelio-orange focus:ring-winelio-orange/15"
  }`;
