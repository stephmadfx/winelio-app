import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder";

export const stripe = new Stripe(key, {
  apiVersion: "2026-03-25.dahlia",
});
