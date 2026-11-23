"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/context";

export async function createOrganization(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  if (!name) redirect("/app/bienvenue?erreur=" + encodeURIComponent("Indiquez un nom."));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { org_name: name });
  if (error) redirect("/app/bienvenue?erreur=" + encodeURIComponent(error.message));
  (await cookies()).set(ORG_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect("/app/biens?nouveau=1");
}
