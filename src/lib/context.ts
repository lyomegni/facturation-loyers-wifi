import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Role } from "@/lib/types";

export const ORG_COOKIE = "fx_org";

/** Utilisateur connecté, espace actif et rôle. Redirige si besoin. */
export async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organizations(*)")
    .eq("user_id", user.id);

  const list = (memberships ?? []).map((m) => ({
    role: m.role as Role,
    org: m.organizations as unknown as Organization,
  }));
  if (list.length === 0) redirect("/app/bienvenue");

  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = list.find((m) => m.org.id === wanted) ?? list[0];

  return {
    supabase,
    user,
    org: current.org,
    role: current.role,
    canEdit: current.role !== "lecteur",
    isAdmin: current.role === "admin",
    organizations: list,
  };
}

export type AppContext = Awaited<ReturnType<typeof getContext>>;

export function assertCanEdit(ctx: AppContext) {
  if (!ctx.canEdit) throw new Error("Votre rôle ne permet pas de modifier les données.");
}

export function assertAdmin(ctx: AppContext) {
  if (!ctx.isAdmin) throw new Error("Action réservée aux administrateurs.");
}
