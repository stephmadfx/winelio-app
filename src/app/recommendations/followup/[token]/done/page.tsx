import { FollowupDoneConfirmation } from "@/components/followup-done-confirmation";
import { verifyFollowupToken } from "@/lib/followup-token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function Unavailable({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F0F2F4] p-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-5xl" aria-hidden="true">⚠️</div>
        <h1 className="text-xl font-bold text-winelio-dark">Confirmation indisponible</h1>
        <p className="mt-3 text-sm leading-6 text-winelio-gray">{message}</p>
        <a href="https://winelio.app" className="mt-6 inline-flex text-sm font-semibold text-winelio-orange underline">
          Aller sur Winelio
        </a>
      </section>
    </main>
  );
}

export default async function FollowupDonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyFollowupToken(token);

  if (!verified.ok) {
    return <Unavailable message="Ce lien est invalide ou a expiré." />;
  }

  const { data: followup } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("after_step_order")
    .eq("id", verified.payload.fid)
    .maybeSingle();

  if (!followup) {
    return <Unavailable message="Cette relance n’existe plus." />;
  }

  return <FollowupDoneConfirmation token={token} afterStep={followup.after_step_order} />;
}
