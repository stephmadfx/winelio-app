import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MIN_AMOUNT = 10;
const MAX_AMOUNT = 10000;
const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const { amount, payment_method, iban, paypal_email } = body;

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

    // Validate payment method
    if (!["bank_transfer", "paypal"].includes(payment_method)) {
      return NextResponse.json(
        { error: "Méthode de paiement invalide" },
        { status: 400 }
      );
    }

    // Validate payment details
    if (payment_method === "bank_transfer") {
      const cleanIban = (iban ?? "").replace(/\s/g, "").toUpperCase();
      if (!IBAN_REGEX.test(cleanIban)) {
        return NextResponse.json({ error: "IBAN invalide" }, { status: 400 });
      }
    }
    if (payment_method === "paypal") {
      if (!paypal_email || !EMAIL_REGEX.test(paypal_email)) {
        return NextResponse.json(
          { error: "Email PayPal invalide" },
          { status: 400 }
        );
      }
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

    // Insert withdrawal
    const paymentDetails =
      payment_method === "bank_transfer"
        ? { iban: (iban ?? "").replace(/\s/g, "").toUpperCase() }
        : { email: paypal_email.trim() };

    const { error: insertError } = await supabase.from("withdrawals").insert({
      user_id: user.id,
      amount: parsedAmount,
      payment_method,
      payment_details: paymentDetails,
      status: "pending",
    });

    if (insertError) {
      return NextResponse.json(
        { error: "Erreur lors de la création du retrait" },
        { status: 500 }
      );
    }

    // Update wallet (server-side calculation)
    const { error: updateError } = await supabase
      .from("user_wallet_summaries")
      .update({
        available: wallet.available - parsedAmount,
        total_withdrawn: (wallet.total_withdrawn ?? 0) + parsedAmount,
      })
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Erreur lors de la mise à jour du solde" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
