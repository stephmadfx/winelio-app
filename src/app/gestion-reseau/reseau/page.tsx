import { supabaseAdmin } from "@/lib/supabase/admin";
import { NetworkTreeWrapper } from "./NetworkTreeWrapper";

export default async function AdminReseau() {
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, sponsor_id, is_professional, is_suspended")
    .neq("role", "super_admin");

  const nodes = profiles ?? [];

  // Les racines sont les profils sans sponsor (ou sponsor introuvable dans le dataset)
  const nodeIds = new Set(nodes.map((n) => n.id));
  const rootIds = nodes
    .filter((n) => !n.sponsor_id || !nodeIds.has(n.sponsor_id))
    .map((n) => n.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Réseau MLM</h1>
        <span className="text-sm text-gray-500">
          {nodes.length} membre{nodes.length > 1 ? "s" : ""} ·{" "}
          {rootIds.length} racine{rootIds.length > 1 ? "s" : ""}
        </span>
      </div>
      <NetworkTreeWrapper nodes={nodes} rootIds={rootIds} />
    </div>
  );
}
