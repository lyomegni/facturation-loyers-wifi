import { getContext } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "./import-client";
import type { Property } from "@/lib/types";

export const metadata = { title: "Import Excel" };

export default async function ImportPage() {
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("properties").select("*").eq("org_id", ctx.org.id).eq("archived", false).order("name");
  return (
    <>
      <PageHeader
        title="Importer vos clients"
        subtitle="Un fichier Excel ou CSV, une ligne par client et par contrat. Les immeubles et zones inconnus sont créés."
      />
      <div className="card mb-4 text-sm">
        <p className="label">Colonnes reconnues (dans n&apos;importe quel ordre)</p>
        <p><b>Nom</b> (obligatoire) · <b>Téléphone</b> / WhatsApp · E-mail · <b>Immeuble</b> / Zone · Service (loyer, wifi) · Logement / Appartement · <b>Montant</b> · Jour d&apos;échéance · Date de début</p>
        <p className="mt-1 text-slate-500">Une ligne sans montant crée seulement le client. Un même numéro sur plusieurs lignes = un seul client avec plusieurs contrats.</p>
      </div>
      {ctx.canEdit ? <ImportClient properties={(data ?? []) as Property[]} /> : <p className="text-sm">Votre rôle ne permet pas d&apos;importer.</p>}
    </>
  );
}
