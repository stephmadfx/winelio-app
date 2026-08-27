const API_ADRESSE_URL = "https://api-adresse.data.gouv.fr/search/";

/**
 * Précision du point renvoyé. La recherche n'affiche une distance que pour
 * `housenumber` et `street` : `municipality` désigne le centre de la commune,
 * partagé par toutes les entreprises de la ville, donc inexploitable.
 */
export type GeoPrecision = "housenumber" | "street" | "municipality";

interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
  precision: GeoPrecision;
}

export async function geocodeAddress(
  address: string,
  city: string,
  postalCode: string
): Promise<GeocodeResult | null> {
  const query = [address, postalCode, city].filter(Boolean).join(" ");
  if (!query.trim()) return null;

  try {
    const res = await fetch(
      `${API_ADRESSE_URL}?q=${encodeURIComponent(query)}&limit=1`
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.features || data.features.length === 0) return null;

    const feature = data.features[0];
    const [longitude, latitude] = feature.geometry.coordinates;

    // La BAN renvoie aussi `locality` ou `municipality` quand elle n'a pas su
    // situer la voie : tout ce qui n'est pas une adresse est ramené au niveau
    // commune, faute de quoi on rouvrirait la porte aux fausses distances.
    const type = feature.properties?.type;
    const precision: GeoPrecision =
      type === "housenumber" || type === "street" ? type : "municipality";

    return {
      latitude,
      longitude,
      label: feature.properties.label ?? query,
      precision,
    };
  } catch {
    return null;
  }
}
