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
}

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

export const STEPS_META = [
  { number: 1, label: "Demandeur" },
  { number: 2, label: "Professionnel" },
  { number: 3, label: "Projet" },
] as const;
