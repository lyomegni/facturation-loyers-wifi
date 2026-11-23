import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { createOrganization } from "./actions";

export const metadata = { title: "Bienvenue" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { count } = await supabase.from("memberships").select("*", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) > 0) redirect("/app");

  const { erreur } = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="h1">Créez votre espace</h1>
      <p className="mt-2 text-sm text-slate-600">
        Votre espace regroupe vos immeubles, vos zones Wi-Fi, vos clients et leurs factures. Ce nom
        apparaît en tête de vos factures.
      </p>
      <form action={createOrganization} className="card mt-6 flex flex-col gap-4">
        {erreur && <p className="text-sm text-risk">{erreur}</p>}
        <div>
          <label htmlFor="name" className="label">Nom affiché sur les factures</label>
          <input id="name" name="name" required className="input" placeholder="Ex. Résidences Yomegni" />
        </div>
        <SubmitButton>Créer mon espace</SubmitButton>
      </form>
    </main>
  );
}
