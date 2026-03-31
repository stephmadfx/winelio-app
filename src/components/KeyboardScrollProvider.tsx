"use client";

import { useKeyboardScroll } from "@/hooks/useKeyboardScroll";

/**
 * Provider global — placé dans le root layout pour activer le scroll
 * automatique des champs de saisie quand le clavier mobile s'ouvre.
 * Ne rend rien, agit uniquement via un effet.
 */
export function KeyboardScrollProvider() {
  useKeyboardScroll();
  return null;
}
