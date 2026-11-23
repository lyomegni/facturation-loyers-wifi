"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin, assertCanEdit, getContext } from "@/lib/context";
import { issueInvoicesForOrg } from "@/lib/invoicing";
import { todayIso } from "@/lib/domain/dates";
import { parseXaf } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/server";
import { resendInvoice, sendReceiptIfDue } from "@/lib/whatsapp-dispatch";
import { whatsappDeps } from "@/lib/whatsapp-deps";
import { dateField, failTo, str } from "./helpers";

const METHODS = ["orange_money", "mtn_momo", "especes", "virement", "autre"];

export async function issueInvoicesNow() {
  const ctx = await getContext();
  let n = 0;
  try {
    assertCanEdit(ctx);
    n = await issueInvoicesForOrg(ctx.supabase, ctx.org, todayIso());
  } catch (e) {
    failTo("/app/factures", e);
  }
  revalidatePath("/app", "layout");
  redirect("/app/factures?ok=" + encodeURIComponent(n === 0 ? "Aucune nouvelle facture à émettre pour l'instant." : `${n} facture${n > 1 ? "s" : ""} émise${n > 1 ? "s" : ""}.`));
}

export async function recordPayment(form: FormData) {
  const ctx = await getContext();
  const invoiceId = String(form.get("invoice_id") ?? "");
  const back = `/app/factures/${invoiceId}`;
  try {
    assertCanEdit(ctx);
    const amount = parseXaf(str(form, "amount_xaf"));
    if (!amount) throw new Error("Montant invalide.");
    const method = str(form, "method");
    if (!method || !METHODS.includes(method)) throw new Error("Moyen de paiement invalide.");
    const { data: inv, error: e1 } = await ctx.supabase
      .from("invoices")
      .select("status")
      .eq("id", invoiceId)
      .eq("org_id", ctx.org.id)
      .single();
    if (e1) throw new Error(e1.message);
    if (inv.status === "annulee") throw new Error("Cette facture est annulée.");
    const { error } = await ctx.supabase.from("payments").insert({
      org_id: ctx.org.id,
      invoice_id: invoiceId,
      amount_xaf: amount,
      method,
      paid_on: dateField(form, "paid_on") ?? todayIso(),
      reference: str(form, "reference"),
      recorded_by: ctx.user.id,
    });
    if (error) throw new Error(error.message);
    // Reçu WhatsApp immédiat si ce paiement solde la facture ; ne lève jamais.
    await sendReceiptIfDue(whatsappDeps(createAdminClient()), invoiceId);
  } catch (e) {
    failTo(back, e);
  }
  revalidatePath("/app", "layout");
  redirect(`${back}?ok=` + encodeURIComponent("Paiement enregistré."));
}

export async function deletePayment(form: FormData) {
  const ctx = await getContext();
  const invoiceId = String(form.get("invoice_id") ?? "");
  try {
    assertAdmin(ctx);
    const { error } = await ctx.supabase.from("payments").delete().eq("id", String(form.get("id") ?? "")).eq("org_id", ctx.org.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    failTo(`/app/factures/${invoiceId}`, e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/factures/${invoiceId}?ok=` + encodeURIComponent("Paiement supprimé."));
}

export async function setInvoiceCancelled(form: FormData) {
  const ctx = await getContext();
  const id = String(form.get("id") ?? "");
  const cancel = form.get("cancel") === "1";
  try {
    assertCanEdit(ctx);
    const { data: inv, error: e1 } = await ctx.supabase.from("invoices").select("paid_xaf, amount_xaf").eq("id", id).eq("org_id", ctx.org.id).single();
    if (e1) throw new Error(e1.message);
    if (cancel && inv.paid_xaf > 0) throw new Error("Supprimez d'abord les paiements de cette facture.");
    const { error } = await ctx.supabase
      .from("invoices")
      .update({ status: cancel ? "annulee" : "a_payer" })
      .eq("id", id)
      .eq("org_id", ctx.org.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    failTo(`/app/factures/${id}`, e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/factures/${id}?ok=` + encodeURIComponent(cancel ? "Facture annulée." : "Facture rétablie."));
}

export async function resendInvoiceWhatsapp(form: FormData) {
  const ctx = await getContext();
  const invoiceId = String(form.get("invoice_id") ?? "");
  const back = `/app/factures/${invoiceId}`;
  try {
    assertCanEdit(ctx);
    // Vérifie que la facture appartient bien à l'espace courant (RLS) avant d'utiliser la clé service.
    const { data: inv, error } = await ctx.supabase.from("invoices").select("id").eq("id", invoiceId).eq("org_id", ctx.org.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Facture introuvable.");
    const result = await resendInvoice(whatsappDeps(createAdminClient()), invoiceId);
    if (result.outcome === "incertain") throw new Error("WhatsApp n'a pas confirmé l'envoi. Vérifiez l'historique avant de renvoyer.");
  } catch (e) {
    failTo(back, e);
  }
  revalidatePath(back);
  redirect(`${back}?ok=` + encodeURIComponent("Facture renvoyée sur WhatsApp."));
}
