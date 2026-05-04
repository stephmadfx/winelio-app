import { supabaseAdmin } from "@/lib/supabase/admin";
import { type FlowAnnotation } from "@/components/admin/FlowAnnotationDialog";
import { ProLifecycleFlowchartClient } from "@/components/admin/ProLifecycleFlowchartClient";

export const metadata = { title: "Cycle de vie pro — Admin" };

export default async function ProcessusProPage() {
  // Réutilise la même table d'annotations (clés node_id sont uniques au flowchart)
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
              Cycle de vie d&apos;un{" "}
              <span className="text-[#FF6B35]">professionnel</span>
            </h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Inscription · OTP · sponsor · onboarding pro (SIRET → CGU → Stripe) · emails déclenchés
            </p>
          </div>
          <span className="text-[11px] bg-[#FFF5F0] border border-[#FF6B35] text-[#FF6B35] font-bold rounded-full px-3 py-1">
            🔐 Super administrateur
          </span>
        </div>
      </div>

      <div className="flex-1 bg-[#FAFBFC]">
        <ProLifecycleFlowchartClient annotations={annotations} />
      </div>
    </div>
  );
}
