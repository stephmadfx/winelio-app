import assert from "node:assert/strict";
import { createTestUser } from "../e2e/helpers/factories";
import { E2E, e2eEmail } from "../e2e/helpers/env";
import { wn } from "../e2e/helpers/supabase";
import { cleanupE2EAccounts } from "../e2e/helpers/cleanup";

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = E2E.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = E2E.supabaseKey;
  const { recalculateWallet } = await import("../../src/lib/wallet");
  const check = (result: { error: { message: string } | null }) => { if (result.error) throw new Error(result.error.message); };
  try {
    const user = await createTestUser({ email:e2eEmail("wallet-reservation") });
    check(await wn().from("commission_transactions").insert([
      { user_id:user.id,amount:300,type:"manual_adjustment",level:0,status:"EARNED" },
      { user_id:user.id,amount:50,type:"professional_cashback",level:0,status:"EARNED" },
      { user_id:user.id,amount:20,type:"manual_adjustment",level:0,status:"PENDING" },
      { user_id:user.id,amount:30,type:"professional_cashback",level:0,status:"PENDING" },
    ]));
    check(await wn().from("user_wallet_summaries").update({ redeemed_wins:10 }).eq("user_id",user.id));
    check(await wn().rpc("process_withdrawal",{ p_user_id:user.id,p_amount:25,p_payment_method:"bank_transfer",p_payment_details:{},p_fee_amount:0.25 }));
    check(await wn().rpc("process_withdrawal",{ p_user_id:user.id,p_amount:40,p_payment_method:"bank_transfer",p_payment_details:{},p_fee_amount:0.25 }));
    await recalculateWallet(user.id);
    const { data: pending } = await wn().from("user_wallet_summaries").select("available,total_withdrawn,pending_commissions,total_wins,available_wins").eq("user_id",user.id).single();
    assert.equal(pending?.available,235,"Deux retraits en attente restent réservés après recalcul");
    assert.equal(pending?.total_withdrawn,65);
    assert.equal(pending?.pending_commissions,20,"Les Wins en attente restent séparés des EUR");
    assert.equal(pending?.total_wins,50);
    assert.equal(pending?.available_wins,40,"Les Wins déjà utilisés sont préservés");
    const { data: withdrawals } = await wn().from("withdrawals").select("id,amount").eq("user_id",user.id).order("amount");
    assert.equal(withdrawals?.length,2);
    check(await wn().from("withdrawals").update({ status:"COMPLETED",processed_at:new Date().toISOString() }).eq("id",withdrawals![0].id));
    await recalculateWallet(user.id);
    const { data: paid } = await wn().from("user_wallet_summaries").select("available").eq("user_id",user.id).single();
    assert.equal(paid?.available,235,"Un retrait payé ne libère pas les autres demandes en attente");
    check(await wn().from("withdrawals").update({ status:"REJECTED" }).eq("id",withdrawals![1].id));
    await recalculateWallet(user.id);
    const { data: rejected } = await wn().from("user_wallet_summaries").select("available").eq("user_id",user.id).single();
    assert.equal(rejected?.available,275,"Seul le montant rejeté est libéré");
    await Promise.all(Array.from({ length:5 }, async () => {
      await Promise.all([
        recalculateWallet(user.id),
        wn().rpc("process_withdrawal",{ p_user_id:user.id,p_amount:10,p_payment_method:"bank_transfer",p_payment_details:{},p_fee_amount:0.25 }).then(check),
      ]);
    }));
    const { data: concurrent } = await wn().from("user_wallet_summaries").select("available,total_withdrawn").eq("user_id",user.id).single();
    assert.equal(concurrent?.available,225,"Les recalculs concurrents ne perdent aucune réservation");
    assert.equal(concurrent?.total_withdrawn,75);
    await assert.rejects(() => recalculateWallet("invalid-id"),/Impossible de recalculer/);
    console.log("wallet-reservations: réservations, paiement et rejet OK");
  } finally {
    await cleanupE2EAccounts();
    console.log("wallet-reservations: nettoyage effectué");
  }
}
main().catch((error) => { console.error(error); process.exitCode=1; });
