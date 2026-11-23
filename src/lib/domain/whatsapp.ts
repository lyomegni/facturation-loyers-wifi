import { addDays, formatDate } from "./dates";
import { formatXaf } from "./money";

export type MessageKind = "facture" | "rappel_j-3" | "rappel_j" | "rappel_j+3" | "rappel_j+7" | "recu" | "renvoi";
export type MessageStatus = "en_cours" | "envoye" | "remis" | "lu" | "echec" | "incertain" | "non_remis";

/** Message déjà journalisé ; `day` = jour (Douala) de la dernière tentative. */
export type SentMessage = { kind: MessageKind; status: MessageStatus; attempts: number; day: string };

export type InvoiceForRule = {
  status: "a_payer" | "payee" | "annulee";
  issued_on: string;
  due_on: string;
  paid_at: string | null;
};

export const MAX_ATTEMPTS = 3;
export const CATCH_UP_DAYS = 2;
/** Au-delà de l'échéance + 7 jours, plus aucun rappel (pas de relance des vieilles dettes). */
const LAST_REMINDER_DAYS = 7;

/** Un message bloque un nouvel envoi du même type, sauf un refus explicite encore réessayable. */
export function isBlocking(m: SentMessage): boolean {
  return !(m.status === "echec" && m.attempts < MAX_ATTEMPTS);
}

/** Nombre de jours entre deux dates AAAA-MM-JJ (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const REMINDERS: { kind: MessageKind; offset: number }[] = [
  { kind: "rappel_j-3", offset: -3 },
  { kind: "rappel_j", offset: 0 },
  { kind: "rappel_j+3", offset: 3 },
  { kind: "rappel_j+7", offset: 7 },
];

/** Le message à envoyer aujourd'hui pour cette facture, ou null. */
export function nextMessage(inv: InvoiceForRule, sent: SentMessage[], today: string): MessageKind | null {
  const blocked = (kind: MessageKind) => sent.some((m) => m.kind === kind && isBlocking(m));
  const inWindow = (date: string) => {
    const age = daysBetween(date, today);
    return age >= 0 && age <= CATCH_UP_DAYS;
  };

  if (inv.status === "annulee") return null;

  if (inv.status === "payee") {
    return inv.paid_at && inWindow(inv.paid_at) && !blocked("recu") ? "recu" : null;
  }

  if (daysBetween(inv.due_on, today) > LAST_REMINDER_DAYS) return null;
  if (sent.some((m) => isBlocking(m) && m.day === today)) return null;
  if (!blocked("facture") && inWindow(inv.issued_on)) return "facture";

  const due = REMINDERS.map((r) => ({ kind: r.kind, date: addDays(inv.due_on, r.offset) })).filter(
    (r) => r.date >= inv.issued_on && r.date <= today,
  );
  const latest = due.at(-1);
  if (!latest || !inWindow(latest.date) || blocked(latest.kind)) return null;
  return latest.kind;
}

export type TemplateCall = { name: string; params: string[] };

export type InvoiceForTemplate = {
  number: string;
  label: string;
  amount_xaf: number;
  paid_xaf: number;
  due_on: string;
  paid_at: string | null;
  public_token: string;
  customer_name: string;
};

/** Nom du modèle Meta et ses paramètres, dans l'ordre des variables {{1}}, {{2}}… */
export function templateFor(kind: MessageKind, inv: InvoiceForTemplate, appUrl: string): TemplateCall {
  const base = appUrl.replace(/\/+$/, "");
  const link = `${base}/f/${inv.public_token}`;
  const rest = formatXaf(Math.max(inv.amount_xaf - inv.paid_xaf, 0));
  const head = [inv.customer_name, inv.number, inv.label];
  switch (kind) {
    case "facture":
    case "renvoi":
      return { name: "facture_emise", params: [...head, formatXaf(inv.amount_xaf), formatDate(inv.due_on), link] };
    case "rappel_j-3":
      return { name: "rappel_avant_echeance", params: [...head, rest, formatDate(inv.due_on), link] };
    case "rappel_j":
      return { name: "rappel_echeance", params: [...head, rest, link] };
    case "rappel_j+3":
    case "rappel_j+7":
      return { name: "rappel_retard", params: [...head, formatDate(inv.due_on), rest, link] };
    case "recu":
      return {
        name: "recu_paiement",
        params: [inv.customer_name, formatXaf(inv.paid_xaf), inv.number, inv.label, formatDate(inv.paid_at), `${base}/api/factures/${inv.public_token}/pdf`],
      };
  }
}
