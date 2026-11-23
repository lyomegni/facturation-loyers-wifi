import type { SupabaseClient } from "@supabase/supabase-js";
import { operatorToMethod, type CampayTransaction } from "@/lib/domain/campay";

export type RecordOutcome = "enregistre" | "deja_enregistre" | "ignore_statut" | "facture_introuvable" | "facture_annulee";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enregistre une fois pour toutes un paiement Campay réussi (idempotent sur la référence Campay). */
export async function recordCampayPayment(db: SupabaseClient, tx: CampayTransaction, today: string): Promise<RecordOutcome> {
  if (tx.status !== "SUCCESSFUL") return "ignore_statut";
  if (!tx.externalReference || !UUID.test(tx.externalReference)) return "facture_introuvable";
  const { data, error } = await db.rpc("record_provider_payment", {
    p_invoice: tx.externalReference,
    p_amount: tx.amount,
    p_method: operatorToMethod(tx.operator),
    p_paid_on: today,
    p_provider: "campay",
    p_provider_ref: tx.reference,
    p_reference: tx.operatorReference,
  });
  if (error) throw new Error(error.message);
  return data as RecordOutcome;
}
