import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, periodOf } from "@/lib/domain/dates";
import { invoiceKey, invoicesToIssue, type ContractForBilling } from "@/lib/domain/invoicing";

/**
 * Émet les factures dues pour un espace (mois en cours et suivant). Idempotent :
 * une facture par contrat et par mois, garantie par la contrainte unique (contract_id, period).
 */
export async function issueInvoicesForOrg(
  db: SupabaseClient,
  org: { id: string; invoice_lead_days: number },
  today: string,
): Promise<number> {
  const { data: contracts, error } = await db
    .from("contracts")
    .select("id, org_id, customer_id, property_id, service, label, unit, amount_xaf, due_day, start_on, end_on, active")
    .eq("org_id", org.id)
    .eq("active", true);
  if (error) throw new Error(error.message);
  if (!contracts?.length) return 0;

  const current = periodOf(today);
  const { data: existing, error: e2 } = await db
    .from("invoices")
    .select("contract_id, period")
    .eq("org_id", org.id)
    .in("period", [current, addMonths(current, 1)])
    .not("contract_id", "is", null);
  if (e2) throw new Error(e2.message);

  const keys = new Set((existing ?? []).map((i) => invoiceKey(i.contract_id as string, i.period as string)));
  const drafts = invoicesToIssue(contracts as ContractForBilling[], keys, today, org.invoice_lead_days);
  if (drafts.length === 0) return 0;

  const { data: inserted, error: e3 } = await db
    .from("invoices")
    .upsert(drafts, { onConflict: "contract_id,period", ignoreDuplicates: true })
    .select("id");
  if (e3) throw new Error(e3.message);
  return inserted?.length ?? 0;
}
