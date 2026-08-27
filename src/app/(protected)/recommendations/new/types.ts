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

export type Urgency = "urgent" | "normal" | "flexible";

/** Choix explicite de l’étape Demandeur — aucune valeur par défaut. */
export type BeneficiaryChoice = "self" | "other";

export const STEPS_META = [
  { number: 1, label: "Demandeur" },
  { number: 2, label: "Professionnel" },
  { number: 3, label: "Projet" },
] as const;
