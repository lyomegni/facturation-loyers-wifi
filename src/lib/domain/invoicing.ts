import { addDays, addMonths, lastDayOf, periodLabel, periodOf } from "./dates";

export type Service = "loyer" | "wifi" | "autre";

export const SERVICE_LABELS: Record<Service, string> = {
  loyer: "Loyer",
  wifi: "Redevance Wi-Fi",
  autre: "Autre",
};

export type ContractForBilling = {
  id: string;
  org_id: string;
  customer_id: string;
  property_id: string;
  service: Service;
  label: string;
  unit: string | null;
  amount_xaf: number;
  due_day: number;
  start_on: string;
  end_on: string | null;
  active: boolean;
};

export type InvoiceDraft = {
  org_id: string;
  contract_id: string;
  customer_id: string;
  property_id: string;
  period: string;
  label: string;
  amount_xaf: number;
  issued_on: string;
  due_on: string;
};

/** Date d'échéance d'un contrat pour un mois donné (le jour d'échéance est limité à 28). */
export function dueDateFor(period: string, dueDay: number): string {
  return `${period.slice(0, 8)}${String(dueDay).padStart(2, "0")}`;
}

/** Le contrat couvre-t-il ce mois ? */
export function coversPeriod(c: Pick<ContractForBilling, "start_on" | "end_on">, period: string): boolean {
  if (c.start_on > lastDayOf(period)) return false;
  if (c.end_on && c.end_on < period) return false;
  return true;
}

export function invoiceLabel(c: Pick<ContractForBilling, "label" | "unit">, period: string): string {
  return `${c.label}${c.unit ? ` · ${c.unit}` : ""} · ${periodLabel(period)}`;
}

/**
 * Factures à émettre aujourd'hui : pour le mois en cours et le suivant, chaque contrat actif
 * reçoit sa facture dès que l'on est à `leadDays` jours (ou moins) de l'échéance.
 * `existing` contient les clés « contractId:période » déjà facturées. Aucun rattrapage des mois passés.
 */
export function invoicesToIssue(
  contracts: ContractForBilling[],
  existing: Set<string>,
  today: string,
  leadDays: number,
): InvoiceDraft[] {
  const current = periodOf(today);
  const periods = [current, addMonths(current, 1)];
  const drafts: InvoiceDraft[] = [];
  for (const c of contracts) {
    if (!c.active) continue;
    for (const period of periods) {
      if (!coversPeriod(c, period)) continue;
      if (existing.has(invoiceKey(c.id, period))) continue;
      const due = dueDateFor(period, c.due_day);
      if (today < addDays(due, -leadDays)) continue;
      drafts.push({
        org_id: c.org_id,
        contract_id: c.id,
        customer_id: c.customer_id,
        property_id: c.property_id,
        period,
        label: invoiceLabel(c, period),
        amount_xaf: c.amount_xaf,
        issued_on: today,
        due_on: due,
      });
    }
  }
  return drafts;
}

export function invoiceKey(contractId: string, period: string): string {
  return `${contractId}:${period}`;
}

export type StoredStatus = "a_payer" | "payee" | "annulee";
export type DisplayStatus = "a_payer" | "partielle" | "en_retard" | "payee" | "annulee";

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  a_payer: "À payer",
  partielle: "Partiellement payée",
  en_retard: "En retard",
  payee: "Payée",
  annulee: "Annulée",
};

export function displayStatus(
  inv: { status: StoredStatus; due_on: string; paid_xaf: number },
  today: string,
): DisplayStatus {
  if (inv.status !== "a_payer") return inv.status;
  if (inv.due_on < today) return "en_retard";
  if (inv.paid_xaf > 0) return "partielle";
  return "a_payer";
}

export function remaining(inv: { amount_xaf: number; paid_xaf: number; status: StoredStatus }): number {
  if (inv.status === "annulee") return 0;
  return Math.max(0, inv.amount_xaf - inv.paid_xaf);
}
