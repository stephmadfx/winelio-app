import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MIN_AMOUNT = 10;
const MAX_AMOUNT = 10000;
const FREE_THRESHOLD = 50;   // retraits ≥ 50 € → gratuit
const STRIPE_FEE = 0.25;     // frais fixes SEPA Stripe pour retraits < 50 €
const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { amount, iban } = body;

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }
    if (parsedAmount < MIN_AMOUNT) {
      return NextResponse.json(
        { error: `Montant minimum : ${MIN_AMOUNT} EUR` },
        { status: 400 }
      );
    }
    if (parsedAmount > MAX_AMOUNT) {
      return NextResponse.json(
        { error: `Montant maximum : ${MAX_AMOUNT} EUR` },
        { status: 400 }
      );
    }

    // Validate IBAN
    const cleanIban = (iban ?? "").replace(/\s/g, "").toUpperCase();
    if (!IBAN_REGEX.test(cleanIban)) {
      return NextResponse.json({ error: "IBAN invalide" }, { status: 400 });
    }

    // Fetch current balance SERVER-SIDE (source of truth)
    const { data: wallet } = await supabase
      .from("user_wallet_summaries")
      .select("available, total_withdrawn")
      .eq("user_id", user.id)
      .single();

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet introuvable" },
        { status: 404 }
      );
    }

    if (parsedAmount > wallet.available) {
      return NextResponse.json(
        { error: "Solde insuffisant" },
        { status: 400 }
      );
    }

    const feeAmount = parsedAmount < FREE_THRESHOLD ? STRIPE_FEE : 0;
    const paymentDetails = { iban: cleanIban };

    // Opération atomique via RPC (insert + update dans une seule transaction)
    const { data: rpcResult, error: rpcError } = await supabase.rpc("process_withdrawal", {
      p_user_id: user.id,
      p_amount: parsedAmount,
      p_payment_method: "bank_transfer",
      p_payment_details: paymentDetails,
      p_fee_amount: feeAmount,
    });

    if (rpcError) {
      return NextResponse.json({ error: "Erreur lors du retrait" }, { status: 500 });
    }

    const result = rpcResult as { error?: string; success?: boolean };
    if (result?.error === "insufficient_balance") {
      return NextResponse.json({ error: "Solde insuffisant" }, { status: 400 });
    }
    if (result?.error === "wallet_not_found") {
      return NextResponse.json({ error: "Wallet introuvable" }, { status: 404 });
    }
    if (result?.error) {
      return NextResponse.json({ error: "Erreur lors du retrait" }, { status: 500 });
    }

    return NextResponse.json({ success: true, fee_amount: feeAmount, net_amount: parsedAmount - feeAmount });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
