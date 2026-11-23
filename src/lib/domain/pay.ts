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
