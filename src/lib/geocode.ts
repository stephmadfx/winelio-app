const API_ADRESSE_URL = "https://api-adresse.data.gouv.fr/search/";

interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
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

    return {
      latitude,
      longitude,
      label: feature.properties.label ?? query,
    };
  } catch {
    return null;
  }
}
