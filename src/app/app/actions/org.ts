"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin, getContext, ORG_COOKIE } from "@/lib/context";
import { failTo, intField, required, str } from "./helpers";

export async function switchOrganization(form: FormData) {
  const id = String(form.get("org") ?? "");
  (await cookies()).set(ORG_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function updateOrganization(form: FormData) {
  const ctx = await getContext();
  try {
    assertAdmin(ctx);
    const prefix = (str(form, "invoice_prefix") ?? "FAC").toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(prefix)) throw new Error("Préfixe : 1 à 8 lettres ou chiffres, sans espace.");
    const { error } = await ctx.supabase
      .from("organizations")
      .update({
        name: required(form, "name", "Nom"),
        address: str(form, "address"),
        phone: str(form, "phone"),
        email: str(form, "email"),
        tax_id: str(form, "tax_id"),
        invoice_prefix: prefix,
        invoice_lead_days: intField(form, "invoice_lead_days", 0, 28),
        whatsapp_enabled: form.get("whatsapp_enabled") === "on",
      })
      .eq("id", ctx.org.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    failTo("/app/parametres", e);
  }
  revalidatePath("/app", "layout");
  redirect("/app/parametres?ok=" + encodeURIComponent("Paramètres enregistrés."));
}
