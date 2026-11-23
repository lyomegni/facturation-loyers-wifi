"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCanEdit, getContext } from "@/lib/context";
import { normalizePhone } from "@/lib/domain/phone";
import { parseXaf } from "@/lib/domain/money";
import { dateField, failTo, intField, required, str } from "./helpers";

function phone(form: FormData): string | null {
  const p = normalizePhone(str(form, "phone"));
  if (p === "invalid") throw new Error("Numéro WhatsApp invalide. Exemple : 699 00 00 00 ou +237 699 00 00 00.");
  return p;
}

function dbError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("Ce numéro WhatsApp est déjà utilisé par un autre client.");
  return new Error(error.message);
}

export async function createCustomer(form: FormData) {
  const ctx = await getContext();
  let id = "";
  try {
    assertCanEdit(ctx);
    const { data, error } = await ctx.supabase
      .from("customers")
      .insert({ org_id: ctx.org.id, name: required(form, "name", "Nom"), phone: phone(form), email: str(form, "email"), notes: str(form, "notes"), whatsapp_opt_out: form.get("whatsapp_opt_out") === "on" })
      .select("id")
      .single();
    if (error) throw dbError(error);
    id = data.id;
  } catch (e) {
    failTo("/app/clients", e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/clients/${id}?ok=` + encodeURIComponent("Client créé. Ajoutez-lui un contrat ci-dessous."));
}

export async function updateCustomer(form: FormData) {
  const ctx = await getContext();
  const id = String(form.get("id") ?? "");
  try {
    assertCanEdit(ctx);
    const { error } = await ctx.supabase
      .from("customers")
      .update({ name: required(form, "name", "Nom"), phone: phone(form), email: str(form, "email"), notes: str(form, "notes"), archived: form.get("archived") === "on", whatsapp_opt_out: form.get("whatsapp_opt_out") === "on" })
      .eq("id", id)
      .eq("org_id", ctx.org.id);
    if (error) throw dbError(error);
  } catch (e) {
    failTo(`/app/clients/${id}`, e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/clients/${id}?ok=` + encodeURIComponent("Client enregistré."));
}

function contractFields(form: FormData) {
  const service = str(form, "service");
  if (service !== "loyer" && service !== "wifi" && service !== "autre") throw new Error("Service invalide.");
  const amount = parseXaf(str(form, "amount_xaf"));
  if (!amount) throw new Error("Montant mensuel invalide.");
  const start = dateField(form, "start_on");
  if (!start) throw new Error("Champ obligatoire : Date de début");
  const end = dateField(form, "end_on");
  if (end && end < start) throw new Error("La date de fin précède la date de début.");
  return {
    property_id: required(form, "property_id", "Immeuble ou zone"),
    service,
    label: required(form, "label", "Libellé"),
    unit: str(form, "unit"),
    amount_xaf: amount,
    due_day: intField(form, "due_day", 1, 28),
    start_on: start,
    end_on: end,
  };
}

export async function createContract(form: FormData) {
  const ctx = await getContext();
  const customerId = String(form.get("customer_id") ?? "");
  try {
    assertCanEdit(ctx);
    const { error } = await ctx.supabase.from("contracts").insert({ org_id: ctx.org.id, customer_id: customerId, ...contractFields(form) });
    if (error) throw new Error(error.message);
  } catch (e) {
    failTo(`/app/clients/${customerId}`, e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/clients/${customerId}?ok=` + encodeURIComponent("Contrat ajouté. Ses factures seront émises automatiquement."));
}

export async function updateContract(form: FormData) {
  const ctx = await getContext();
  const customerId = String(form.get("customer_id") ?? "");
  const id = String(form.get("id") ?? "");
  try {
    assertCanEdit(ctx);
    const { error } = await ctx.supabase
      .from("contracts")
      .update({ ...contractFields(form), active: form.get("active") === "on" })
      .eq("id", id)
      .eq("org_id", ctx.org.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    failTo(`/app/clients/${customerId}`, e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/clients/${customerId}?ok=` + encodeURIComponent("Contrat enregistré."));
}
