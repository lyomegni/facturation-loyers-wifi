import {
  isBlocking,
  nextMessage,
  templateFor,
  type InvoiceForRule,
  type InvoiceForTemplate,
  type MessageKind,
  type SentMessage,
  type TemplateCall,
} from "@/lib/domain/whatsapp";
import type { SendResult } from "@/lib/whatsapp";

export type Candidate = InvoiceForRule &
  InvoiceForTemplate & {
    id: string;
    phone: string | null;
    opt_out: boolean;
    org_enabled: boolean;
    sent: SentMessage[];
  };

export interface WhatsappStore {
  expireStale(): Promise<void>;
  candidates(today: string): Promise<Candidate[]>;
  candidate(invoiceId: string): Promise<Candidate | null>;
  /** Réserve l'envoi (ligne « en_cours ») ; null si rien n'est réservé. */
  reserve(invoiceId: string, kind: MessageKind, phone: string, template: string): Promise<string | null>;
  finish(id: string, result: SendResult): Promise<void>;
}

export type Sender = (to: string, call: TemplateCall) => Promise<SendResult>;

export type DispatchDeps = { store: WhatsappStore; send: Sender; today: string; appUrl: string; configured: boolean };

type Counts = { sent: number; failed: number; uncertain: number };

function contactable(c: Candidate): c is Candidate & { phone: string } {
  return c.org_enabled && !!c.phone && !c.opt_out;
}

/** Réserve, envoie, enregistre le résultat. null si la réservation a échoué (déjà pris). */
async function deliver(deps: DispatchDeps, c: Candidate & { phone: string }, kind: MessageKind): Promise<SendResult | null> {
  const call = templateFor(kind, c, deps.appUrl);
  const id = await deps.store.reserve(c.id, kind, c.phone, call.name);
  if (!id) return null;
  let result: SendResult;
  try {
    result = await deps.send(c.phone, call);
  } catch (e) {
    result = { outcome: "incertain", error: e instanceof Error ? e.message : String(e) };
  }
  await deps.store.finish(id, result);
  return result;
}

/** Envoi quotidien : facture, rappels et reçus en attente, pour tous les espaces. */
export async function runDaily(deps: DispatchDeps): Promise<Counts> {
  const counts: Counts = { sent: 0, failed: 0, uncertain: 0 };
  if (!deps.configured) return counts;
  await deps.store.expireStale();
  for (const c of await deps.store.candidates(deps.today)) {
    try {
      if (!contactable(c)) continue;
      const kind = nextMessage(c, c.sent, deps.today);
      if (!kind) continue;
      const result = await deliver(deps, c, kind);
      if (!result) continue;
      if (result.outcome === "envoye") counts.sent++;
      else if (result.outcome === "echec") counts.failed++;
      else counts.uncertain++;
    } catch (e) {
      console.error(`[whatsapp] facture ${c.id}`, e);
    }
  }
  return counts;
}

/** Envoie le reçu tout de suite si la facture vient d'être soldée. Ne lève jamais. */
export async function sendReceiptIfDue(deps: DispatchDeps, invoiceId: string): Promise<void> {
  try {
    if (!deps.configured) return;
    const c = await deps.store.candidate(invoiceId);
    if (!c || !contactable(c)) return;
    if (nextMessage(c, c.sent, deps.today) !== "recu") return;
    await deliver(deps, c, "recu");
  } catch (e) {
    console.error(`[whatsapp] reçu ${invoiceId}`, e);
  }
}

/** Renvoi manuel de la facture depuis la fiche. Lève une erreur lisible si c'est impossible. */
export async function resendInvoice(deps: DispatchDeps, invoiceId: string): Promise<SendResult> {
  if (!deps.configured) throw new Error("WhatsApp n'est pas configuré.");
  const c = await deps.store.candidate(invoiceId);
  if (!c) throw new Error("Facture introuvable.");
  if (!c.org_enabled) throw new Error("Les envois WhatsApp sont désactivés dans les paramètres.");
  if (!c.phone) throw new Error("Ce client n'a pas de numéro WhatsApp.");
  if (c.opt_out) throw new Error("Ce client a demandé à ne pas être contacté sur WhatsApp.");
  if (c.status !== "a_payer") throw new Error("Seule une facture à payer peut être renvoyée.");
  const invoiceSent = c.sent.some((m) => m.kind === "facture" && isBlocking(m));
  const result = await deliver(deps, c as Candidate & { phone: string }, invoiceSent ? "renvoi" : "facture");
  if (!result) throw new Error("Envoi déjà en cours.");
  if (result.outcome === "echec") throw new Error(`WhatsApp a refusé le message : ${result.error}`);
  return result;
}
