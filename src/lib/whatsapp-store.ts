import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIso } from "@/lib/domain/dates";
import { CATCH_UP_DAYS, type MessageKind, type MessageStatus } from "@/lib/domain/whatsapp";
import type { SendResult } from "@/lib/whatsapp";
import type { Candidate, WhatsappStore } from "@/lib/whatsapp-dispatch";

const SELECT = `id, status, issued_on, due_on, paid_at, number, label, amount_xaf, paid_xaf, public_token,
  customer:customers(name, phone, whatsapp_opt_out),
  org:organizations(whatsapp_enabled),
  messages:whatsapp_messages(kind, status, attempts, attempted_at)`;

export type Row = {
  id: string;
  status: Candidate["status"];
  issued_on: string;
  due_on: string;
  paid_at: string | null;
  number: string | null;
  label: string;
  amount_xaf: number;
  paid_xaf: number;
  public_token: string;
  customer: { name: string; phone: string | null; whatsapp_opt_out: boolean } | null;
  org: { whatsapp_enabled: boolean } | null;
  messages: { kind: MessageKind; status: MessageStatus; attempts: number; attempted_at: string }[] | null;
};

export function toCandidate(r: Row): Candidate {
  return {
    id: r.id,
    status: r.status,
    issued_on: r.issued_on,
    due_on: r.due_on,
    paid_at: r.paid_at,
    number: r.number ?? "",
    label: r.label,
    amount_xaf: r.amount_xaf,
    paid_xaf: r.paid_xaf,
    public_token: r.public_token,
    customer_name: r.customer?.name ?? "",
    phone: r.customer?.phone ?? null,
    opt_out: r.customer?.whatsapp_opt_out ?? false,
    org_enabled: r.org?.whatsapp_enabled ?? false,
    sent: (r.messages ?? []).map((m) => ({
      kind: m.kind,
      status: m.status,
      attempts: m.attempts,
      // Jour de la dernière tentative : un accusé de lecture tardif ne compte pas comme un envoi du jour.
      day: todayIso(new Date(m.attempted_at)),
    })),
  };
}

/** Stockage du journal WhatsApp dans Supabase (client avec la clé service). */
export function supabaseStore(db: SupabaseClient): WhatsappStore {
  return {
    async expireStale() {
      const { error } = await db.rpc("whatsapp_expire_stale");
      if (error) throw new Error(error.message);
    },

    async candidates(today) {
      const { data, error } = await db
        .from("invoices")
        .select(SELECT)
        .or(
          `and(status.eq.a_payer,due_on.gte.${addDays(today, -7)}),and(status.eq.payee,paid_at.gte.${addDays(today, -CATCH_UP_DAYS)})`,
        )
        .order("due_on")
        .limit(2000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Row[]).map(toCandidate);
    },

    async candidate(invoiceId) {
      const { data, error } = await db.from("invoices").select(SELECT).eq("id", invoiceId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toCandidate(data as unknown as Row) : null;
    },

    async reserve(invoiceId, kind, phone, template) {
      const { data, error } = await db.rpc("whatsapp_reserve", {
        p_invoice: invoiceId,
        p_kind: kind,
        p_phone: phone,
        p_template: template,
      });
      if (error) throw new Error(error.message);
      return (data as string | null) ?? null;
    },

    async finish(id, result: SendResult) {
      const patch =
        result.outcome === "envoye"
          ? { status: "envoye", wamid: result.wamid, error: null }
          : { status: result.outcome, error: result.error };
      const { error } = await db
        .from("whatsapp_messages")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "en_cours");
      if (error) throw new Error(error.message);
    },
  };
}
