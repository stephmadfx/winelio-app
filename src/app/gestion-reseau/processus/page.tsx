import { supabaseAdmin } from "@/lib/supabase/admin";
import { type FlowAnnotation } from "@/components/admin/FlowAnnotationDialog";
import { RecoFlowchartClient } from "@/components/admin/RecoFlowchartClient";

export const metadata = { title: "Processus de recommandation — Admin" };

export default async function ProcessusPage() {
  const { data } = await supabaseAdmin
    .schema("winelio")
    .from("process_flow_annotations")
    .select("id, node_id, content, created_at, author:profiles!author_id(first_name, last_name)")
    .order("created_at", { ascending: false });

  const annotations = (data ?? []) as unknown as FlowAnnotation[];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-[#2D3436]">
              Organigramme du processus de{" "}
              <span className="text-[#FF6B35]">recommandation</span>
            </h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Vue d&apos;ensemble · 8 étapes · Générique — Cliquez sur un nœud pour ajouter une note
            </p>
          </div>
          <span className="text-[11px] bg-[#FFF5F0] border border-[#FF6B35] text-[#FF6B35] font-bold rounded-full px-3 py-1">
            🔐 Super administrateur
          </span>
        </div>
      </div>

      <div className="flex-1 bg-[#FAFBFC]">
        <RecoFlowchartClient annotations={annotations} />
      </div>
    </div>
  );
}
