import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createBasicChain } from "../e2e/helpers/scenarios";
import { db, wn } from "../e2e/helpers/supabase";
import { loginAsFast } from "../e2e/helpers/auth";
import { cleanupE2EAccounts } from "../e2e/helpers/cleanup";
import { injectStagingCookie } from "../e2e/helpers/staging";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const page = await context.newPage();
  const check = (result: { error: { message: string } | null }) => { if (result.error) throw new Error(result.error.message); };
  try {
    await injectStagingCookie(context);
    const { pro, referrer, companyId, contactId } = await createBasicChain();
    check(await wn().from("companies").update({ legal_name: "Entreprise de test comptable", address: "3 rue de Test", postal_code: "75001", city: "Paris" }).eq("id",companyId));
    check(await wn().from("profiles").update({ address: "1 rue de Test", postal_code: "75001", city: "Paris" }).eq("id",referrer.id));
    const { data: reco, error: recoError } = await wn().from("recommendations").insert({
      referrer_id: referrer.id, professional_id: pro.id, company_id: companyId, contact_id: contactId,
      project_description: "Test documents EXASUD", status: "PENDING", amount: 1000, is_demo: true,
    }).select("id").single();
    assert.equal(recoError, null);
    const { data: payment, error: paymentError } = await wn().from("stripe_payment_sessions").insert({
      recommendation_id: reco!.id, stripe_session_id: `accounting-test-${reco!.id}`, amount: 100,
      deal_amount: 1000, commission_rate: 10, status: "paid", paid_at: new Date().toISOString(),
    }).select("id").single();
    assert.equal(paymentError, null);
    const { data: invoice } = await wn().from("accounting_documents").select("*").eq("source_id",payment!.id).single();
    assert.ok(invoice);
    const concurrentSources = await Promise.all(Array.from({ length:3 }, async () => {
      const { data: otherReco,error } = await wn().from("recommendations").insert({
        referrer_id:referrer.id,professional_id:pro.id,company_id:companyId,contact_id:contactId,
        project_description:"Test numérotation concurrente",status:"PENDING",amount:1000,is_demo:true,
      }).select("id").single();
      assert.equal(error,null);
      const { data: otherPayment,error: insertError } = await wn().from("stripe_payment_sessions").insert({
        recommendation_id:otherReco!.id,stripe_session_id:`accounting-test-${otherReco!.id}`,
        amount:100,deal_amount:1000,commission_rate:10,status:"paid",paid_at:new Date().toISOString(),
      }).select("id").single();
      assert.equal(insertError,null);
      return otherPayment!.id;
    }));
    const { data: concurrentDocuments } = await wn().from("accounting_documents").select("number,issued_at")
      .in("source_id",concurrentSources).order("issued_at");
    assert.equal(concurrentDocuments?.length,3);
    const numbers = concurrentDocuments!.map((document) => Number(document.number.split("-").at(-1)));
    assert.equal(numbers[1],numbers[0]+1,"Numéros continus sous concurrence");
    assert.equal(numbers[2],numbers[1]+1,"Ordre chronologique sous concurrence");
    await loginAsFast(page,pro.email);
    const cookieChoice = page.getByRole("button",{ name:"Continuer sans accepter",exact:true });
    await cookieChoice.click({ timeout: 5000 }).catch(() => undefined);
    await page.goto("/companies");
    await page.getByRole("link", { name: /Mes factures de commission/ }).click();
    await page.getByText(invoice.number, { exact: true }).waitFor();
    const download = await page.request.get(`/api/accounting/documents/${invoice.id}`);
    assert.equal(download.status(),200,await download.text().then(() => "PDF indisponible"));
    assert.equal(download.headers()["content-type"],"application/pdf");
    const firstPdf = await download.body();
    assert.equal(firstPdf.subarray(0,5).toString(),"%PDF-");
    await page.reload();
    await page.getByText(invoice.number, { exact: true }).waitFor();
    check(await wn().from("companies").update({ legal_name: "Nom modifié après facture" }).eq("id",companyId));
    const again = await page.request.get(`/api/accounting/documents/${invoice.id}`);
    assert.ok(firstPdf.equals(await again.body()),"PDF archivé identique après changement de société cliente");
    assert.equal((await page.request.get(`/api/accounting/documents/not-a-uuid`)).status(),404);
    await mkdir("output/playwright/accounting", { recursive: true });
    await page.screenshot({ path: "output/playwright/accounting/invoices-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector("main")!.getBoundingClientRect().x < 100);
    const pdfLink = page.getByRole("link",{ name:`Télécharger ${invoice.number} en PDF` });
    const bounds = await pdfLink.boundingBox();
    assert.ok(bounds && bounds.x+bounds.width <= 390,"Téléchargement visible sur mobile sans défilement horizontal");
    await page.screenshot({ path: "output/playwright/accounting/invoices-mobile.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),"Pas de débordement mobile");

    await loginAsFast(page,referrer.email);
    assert.equal((await page.request.get(`/api/accounting/documents/${invoice.id}`)).status(),404,"Document tiers protégé");
    assert.equal((await page.request.get("/api/accounting/payouts?year=2026")).status(),403,"Export admin protégé");
    check(await wn().from("user_wallet_summaries").update({ available: 300, total_earned: 300 }).eq("user_id",referrer.id));
    check(await wn().rpc("process_withdrawal", { p_user_id: referrer.id,p_amount:25,p_payment_method:"bank_transfer",p_payment_details:{},p_fee_amount:0.25 }));
    const { data: withdrawal } = await wn().from("withdrawals").select("id").eq("user_id",referrer.id).single();
    assert.ok(withdrawal);
    await page.goto("/wallet/documents");
    await page.getByText("Votre attestation sera disponible après confirmation du versement.").waitFor();
    check(await wn().from("withdrawals").update({ status:"COMPLETED",processed_at:new Date().toISOString() }).eq("id",withdrawal.id));
    const { data: attestation } = await wn().from("accounting_documents").select("*").eq("source_id",withdrawal.id).single();
    assert.ok(attestation);
    await page.reload();
    await page.getByText(attestation.number, { exact:true }).waitFor();
    const attestationPdf = await page.request.get(`/api/accounting/documents/${attestation.id}`);
    assert.equal(attestationPdf.status(),200);
    await writeFile("output/playwright/accounting/attestation-downloaded.pdf",await attestationPdf.body());
    await page.screenshot({ path: "output/playwright/accounting/attestations-mobile.png", fullPage: true });
    await page.getByRole("link", { name: /Consulter toutes mes commissions/ }).click();
    await page.getByText("Retrait - Virement bancaire").first().waitFor();

    check(await wn().from("profiles").update({ address:null }).eq("id",referrer.id));
    check(await wn().rpc("process_withdrawal",{ p_user_id:referrer.id,p_amount:10,p_payment_method:"bank_transfer",p_payment_details:{},p_fee_amount:0.25 }));
    const { data: incompleteWithdrawal } = await wn().from("withdrawals").select("id").eq("user_id",referrer.id).eq("status","PENDING").single();
    assert.ok(incompleteWithdrawal);
    check(await wn().from("withdrawals").update({ status:"COMPLETED",processed_at:new Date().toISOString() }).eq("id",incompleteWithdrawal.id));
    const { data: draft } = await wn().from("accounting_documents").select("id,number").eq("source_id",incompleteWithdrawal.id).single();
    assert.ok(draft);
    assert.equal(draft.number,null,"Aucune numérotation avec une adresse manquante");
    assert.equal((await page.request.get(`/api/accounting/documents/${draft.id}`)).status(),409);
    await page.goto("/wallet/documents");
    await page.getByRole("button",{ name:"Actualiser les documents à compléter",exact:true }).waitFor();
    check(await wn().from("profiles").update({ address:"Adresse complétée" }).eq("id",referrer.id));
    await page.getByRole("button",{ name:"Actualiser les documents à compléter",exact:true }).click();
    await page.getByRole("button",{ name:"Actualiser les documents à compléter",exact:true }).waitFor({ state:"hidden" });
    const { data: issuedDraft } = await wn().from("accounting_documents").select("id,number").eq("id",draft.id).single();
    assert.ok(issuedDraft?.number);
    await page.getByText(issuedDraft.number,{ exact:true }).waitFor();
    assert.equal((await page.request.get(`/api/accounting/documents/${draft.id}`)).status(),200);
    await page.goto("/wallet/history");
    await page.getByText("Retrait - Virement bancaire").first().waitFor();
    await page.route("**/rest/v1/wallet_movements*", (route) => route.fulfill({ status:503,contentType:"application/json",body:'{"message":"Erreur de test temporaire"}' }));
    await page.reload();
    await page.getByRole("alert").filter({ hasText:"Impossible de charger vos commissions et retraits" }).waitFor();
    await page.unroute("**/rest/v1/wallet_movements*");
    await page.getByRole("button",{ name:"Réessayer",exact:true }).click();
    await page.getByText("Retrait - Virement bancaire").first().waitFor();

    // Administrateur de démonstration uniquement : aucun rôle d'un compte réel n'est changé.
    const { error: roleError } = await db().auth.admin.updateUserById(pro.id,{ app_metadata: { role: "super_admin" } });
    assert.equal(roleError,null);
    await loginAsFast(page,pro.email);
    await page.goto("/gestion-reseau/comptabilite");
    await page.getByRole("heading", { name: "Émetteur actuel : EXASUD" }).waitFor();
    const csv = await page.request.get("/api/accounting/payouts?year=2026");
    assert.equal(csv.status(),200);
    assert.ok(!(await csv.text()).includes(attestation.number),"Démonstrations exclues du suivi fiscal réel");
    assert.equal((await page.request.get("/api/accounting/payouts?year=bad")).status(),400);
    await page.setViewportSize({ width:1280,height:900 });
    await page.waitForFunction(() => document.querySelector("main")!.getBoundingClientRect().x >= 256);
    await page.screenshot({ path:"output/playwright/accounting/admin-desktop.png",fullPage:true });
    const anonymous = await browser.newContext({ baseURL:process.env.E2E_BASE_URL });
    await injectStagingCookie(anonymous);
    assert.equal((await anonymous.request.get(`/api/accounting/documents/${invoice.id}`)).status(),401);
    await anonymous.close();
    console.log("accounting-browser: factures, attestations, brouillons, PDF identique, mobile, historique, permissions et CSV OK");
  } finally {
    await context.close();
    await browser.close();
    await cleanupE2EAccounts();
    const { count, error } = await wn().from("profiles").select("id", { count:"exact",head:true }).ilike("email","%@winelio-e2e.local");
    assert.equal(error,null);
    assert.equal(count,0,"Aucun profil de test résiduel");
    const { count: docs } = await wn().from("accounting_documents").select("id", { count:"exact",head:true }).eq("is_demo",true);
    assert.equal(docs,0,"Aucun document de test résiduel");
    console.log("accounting-browser: nettoyage vérifié");
  }
}
main().catch((error) => { console.error(error); process.exitCode=1; });
