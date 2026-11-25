// Sélection Supabase à utiliser pour que les catégories arrivent avec leur famille.
export const CATEGORY_SELECT = "id, name, family:category_families(name, sort_order)";

type Family = { name: string; sort_order: number } | null;
type CategoryWithFamily = { id: string; name: string; family?: Family | Family[] };

const familyOf = (c: CategoryWithFamily): Family =>
  (Array.isArray(c.family) ? c.family[0] : c.family) ?? null;

/** Options d'un <select> de catégories, regroupées par famille de métiers. */
export function CategoryOptions({ categories, valueKey = "id" }: { categories: CategoryWithFamily[]; valueKey?: "id" | "name" }) {
  const groups = new Map<string, { order: number; items: CategoryWithFamily[] }>();
  for (const c of categories) {
    const f = familyOf(c);
    const key = f?.name ?? "Autres";
    const g = groups.get(key) ?? { order: f?.sort_order ?? 999, items: [] };
    g.items.push(c);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([label, g]) => (
      <optgroup key={label} label={label}>
        {g.items.sort((a, b) => a.name.localeCompare(b.name, "fr")).map((c) => (
          <option key={c.id} value={c[valueKey]}>{c.name}</option>
        ))}
      </optgroup>
    ));
}
