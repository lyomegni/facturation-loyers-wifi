import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { BackLink, Field, Flash, PageHeader, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { updateProperty } from "@/app/app/actions/properties";
import { formatXaf } from "@/lib/domain/money";
import { SERVICE_LABELS } from "@/lib/domain/invoicing";
import { PROPERTY_KIND_LABELS, type Contract, type Property } from "@/lib/types";

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string; ok?: string }> }) {
  const { id } = await params;
  const { erreur, ok } = await searchParams;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("properties").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!data) notFound();
  const p = data as Property;
  const { data: contracts } = await ctx.supabase
    .from("contracts")
    .select("*, customer:customers(id, name)")
    .eq("property_id", id)
    .order("active", { ascending: false })
    .order("unit");
  const list = (contracts ?? []) as (Contract & { customer: { id: string; name: string } })[];
  const monthly = list.filter((c) => c.active).reduce((s, c) => s + c.amount_xaf, 0);

  return (
    <>
      <BackLink href="/app/biens">Immeubles et zones Wi-Fi</BackLink>
      <PageHeader title={p.name} subtitle={<>{PROPERTY_KIND_LABELS[p.kind]} · {list.filter((c) => c.active).length} contrat(s) actif(s) · {formatXaf(monthly)} par mois</>} />
      <Flash erreur={erreur} ok={ok} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="table-wrap h-fit">
          <table className="table">
            <thead><tr><th>Client</th><th>Logement / point</th><th>Service</th><th>Montant</th><th>Échéance</th><th></th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} className="text-slate-500">Aucun contrat. Ajoutez-en depuis la fiche d&apos;un client.</td></tr>}
              {list.map((c) => (
                <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                  <td><Link href={`/app/clients/${c.customer.id}`} className="font-medium hover:underline">{c.customer.name}</Link></td>
                  <td>{c.unit ?? "—"}</td>
                  <td>{SERVICE_LABELS[c.service]}</td>
                  <td className="whitespace-nowrap">{formatXaf(c.amount_xaf)}</td>
                  <td>le {c.due_day}</td>
                  <td>{!c.active && <Pill>Terminé</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ctx.canEdit && (
          <form action={updateProperty} className="card flex h-fit flex-col gap-3">
            <h2 className="h2">Modifier</h2>
            <input type="hidden" name="id" value={p.id} />
            <Field label="Type" name="kind">
              <select id="kind" name="kind" className="input" defaultValue={p.kind}>
                <option value="immeuble">Immeuble</option>
                <option value="zone_wifi">Zone Wi-Fi</option>
                <option value="autre">Autre</option>
              </select>
            </Field>
            <Field label="Nom" name="name"><input id="name" name="name" required className="input" defaultValue={p.name} /></Field>
            <Field label="Adresse ou quartier" name="address"><input id="address" name="address" className="input" defaultValue={p.address ?? ""} /></Field>
            <Field label="Notes" name="notes"><textarea id="notes" name="notes" rows={2} className="input" defaultValue={p.notes ?? ""} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" defaultChecked={p.archived} /> Archivé</label>
            <SubmitButton>Enregistrer</SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
