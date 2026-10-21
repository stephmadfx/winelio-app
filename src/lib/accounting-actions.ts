"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AccountingDraftState = { message:string;error:boolean };

export async function completeAccountingDrafts(_previous: AccountingDraftState, _formData: FormData): Promise<AccountingDraftState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error:true,message:"Votre session a expiré. Reconnectez-vous." };
  let lastId: string | undefined;
  let failed = 0;
  for (;;) {
    let query = supabase.from("accounting_documents").select("id,kind,source_id")
      .is("number",null).order("id").limit(100);
    if (user.app_metadata?.role === "super_admin") query = query.eq("is_demo",false);
    else query = query.eq("owner_id",user.id);
    if (lastId) query = query.gt("id",lastId);
    const { data,error } = await query;
    if (error) { failed++; break; }
    for (const document of data ?? []) {
      const { error: issueError } = await supabaseAdmin.rpc("issue_accounting_document", {
        p_kind:document.kind,p_source_id:document.source_id,
      });
      if (issueError) failed++;
    }
    if (!data || data.length < 100) break;
    lastId = data[data.length-1].id;
  }
  revalidatePath("/companies/invoices");
  revalidatePath("/wallet/documents");
  revalidatePath("/gestion-reseau/comptabilite");
  return failed ? { error:true,message:`${failed} document(s) n’ont pas pu être actualisés. Les autres résultats sont conservés. Réessayez.` }
    : { error:false,message:"Vérification terminée. Les pièces encore à compléter restent disponibles ici." };
}
