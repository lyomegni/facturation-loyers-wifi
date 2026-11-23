import { remaining, type StoredStatus } from "./invoicing";

/** Montant que le client peut encore payer en ligne (0 si payée ou annulée). */
export function payableAmount(inv: { status: StoredStatus; amount_xaf: number; paid_xaf: number }): number {
  if (inv.status !== "a_payer") return 0;
  return remaining(inv);
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const [firstName = "", ...rest] = full.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

/** Pourquoi le paiement en ligne est refusé : facture annulée, déjà réglée, ou null s'il reste à payer. */
export function paymentBlock(inv: { status: StoredStatus; amount_xaf: number; paid_xaf: number }): "annulee" | "deja" | null {
  if (inv.status === "annulee") return "annulee";
  return payableAmount(inv) === 0 ? "deja" : null;
}
