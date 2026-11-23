import Link from "next/link";
import { getContext } from "@/lib/context";
import { EmptyState, Field, Flash, PageHeader, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createProperty } from "@/app/app/actions/properties";
import { PROPERTY_KIND_LABELS, type Property } from "@/lib/types";

export const metadata = { title: "Immeubles et zones Wi-Fi" };

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ erreur?: string; nouveau?: string }> }) {
  const { erreur, nouveau } = await searchParams;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("properties").select("*").eq("org_id", ctx.org.id).order("archived").order("name");
  const { data: contracts } = await ctx.supabase.from("contracts").select("property_id").eq("org_id", ctx.org.id).eq("active", true);
  const props = (data ?? []) as Property[];
  const count = new Map<string, number>();
  (contracts ?? []).forEach((c) => count.set(c.property_id, (count.get(c.property_id) ?? 0) + 1));

  return (
    <>
      <PageHeader title="Immeubles et zones Wi-Fi" subtitle="Chaque contrat client est rattaché à un immeuble ou à une zone Wi-Fi." />
      <Flash erreur={erreur} ok={nouveau ? "Espace créé. Commencez par ajouter vos immeubles et vos zones Wi-Fi." : undefined} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {props.length === 0 ? (
            <EmptyState title="Aucun bien pour l'instant">Ajoutez vos 2 immeubles et vos zones Wi-Fi avec le formulaire.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Nom</th><th>Type</th><th>Adresse</th><th>Contrats actifs</th></tr></thead>
                <tbody>
                  {props.map((p) => (
                    <tr key={p.id} className={p.archived ? "opacity-50" : ""}>
                      <td><Link href={`/app/biens/${p.id}`} className="font-medium underline-offset-2 hover:underline">{p.name}</Link></td>
                      <td><Pill>{PROPERTY_KIND_LABELS[p.kind]}</Pill></td>
                      <td>{p.address ?? "—"}</td>
                      <td>{count.get(p.id) ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {ctx.canEdit && (
          <form action={createProperty} className="card flex h-fit flex-col gap-3">
            <h2 className="h2">Ajouter un bien</h2>
            <Field label="Type" name="kind">
              <select id="kind" name="kind" className="input" defaultValue="immeuble">
                <option value="immeuble">Immeuble</option>
                <option value="zone_wifi">Zone Wi-Fi</option>
                <option value="autre">Autre</option>
              </select>
            </Field>
            <Field label="Nom" name="name"><input id="name" name="name" required className="input" placeholder="Ex. Immeuble Bonamoussadi" /></Field>
            <Field label="Adresse ou quartier" name="address"><input id="address" name="address" className="input" /></Field>
            <Field label="Notes" name="notes"><textarea id="notes" name="notes" rows={2} className="input" /></Field>
            <SubmitButton>Ajouter</SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
