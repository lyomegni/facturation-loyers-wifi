"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCanEdit, getContext } from "@/lib/context";
import { failTo, required, str } from "./helpers";

const KINDS = ["immeuble", "zone_wifi", "autre"] as const;

function kind(form: FormData) {
  const k = str(form, "kind");
  if (!k || !(KINDS as readonly string[]).includes(k)) throw new Error("Type de bien invalide.");
  return k;
}

export async function createProperty(form: FormData) {
  const ctx = await getContext();
  let id = "";
  try {
    assertCanEdit(ctx);
    const { data, error } = await ctx.supabase
      .from("properties")
      .insert({ org_id: ctx.org.id, kind: kind(form), name: required(form, "name", "Nom"), address: str(form, "address"), notes: str(form, "notes") })
      .select("id")
      .single();
    if (error) throw new Error(error.code === "23505" ? "Un bien porte déjà ce nom." : error.message);
    id = data.id;
  } catch (e) {
    failTo("/app/biens", e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/biens/${id}`);
}

export async function updateProperty(form: FormData) {
  const ctx = await getContext();
  const id = String(form.get("id") ?? "");
  try {
    assertCanEdit(ctx);
    const { error } = await ctx.supabase
      .from("properties")
      .update({ kind: kind(form), name: required(form, "name", "Nom"), address: str(form, "address"), notes: str(form, "notes"), archived: form.get("archived") === "on" })
      .eq("id", id)
      .eq("org_id", ctx.org.id);
    if (error) throw new Error(error.code === "23505" ? "Un bien porte déjà ce nom." : error.message);
  } catch (e) {
    failTo(`/app/biens/${id}`, e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/biens/${id}?ok=` + encodeURIComponent("Bien enregistré."));
}
