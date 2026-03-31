import { supabaseAdmin } from "@/lib/supabase/admin";
import { NetworkTreeWrapper } from "./NetworkTreeWrapper";

export default async function AdminReseau() {
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email, sponsor_id, is_professional, is_active");

  const nodes = profiles ?? [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const childrenMap = new Map<string, number>();
  for (const n of nodes) {
    if (n.sponsor_id && nodeIds.has(n.sponsor_id)) {
      childrenMap.set(n.sponsor_id, (childrenMap.get(n.sponsor_id) ?? 0) + 1);
    }
  }

  // Racines = pas de sponsor valide dans le dataset
  const allRootIds = nodes
    .filter((n) => !n.sponsor_id || !nodeIds.has(n.sponsor_id))
    .map((n) => n.id);

  // N'afficher que les racines qui ont au moins un filleul (évite d'afficher des centaines de membres isolés)
  const rootIds = allRootIds.filter((id) => (childrenMap.get(id) ?? 0) > 0);
  const isolatedCount = allRootIds.length - rootIds.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Réseau MLM</h1>
        <div className="text-right">
          <span className="text-sm text-gray-500">
            {nodes.length} membre{nodes.length > 1 ? "s" : ""} ·{" "}
            {rootIds.length} tête{rootIds.length > 1 ? "s" : ""} de réseau
          </span>
          {isolatedCount > 0 && (
            <p className="text-xs text-gray-600 mt-0.5">
              {isolatedCount} membre{isolatedCount > 1 ? "s" : ""} isolé{isolatedCount > 1 ? "s" : ""} non affiché{isolatedCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
      <NetworkTreeWrapper nodes={nodes} rootIds={rootIds} />
    </div>
  );
}
