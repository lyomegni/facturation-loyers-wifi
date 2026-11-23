import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { BackLink, Field, Flash, PageHeader, Pill, StatusPill, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ContractForm } from "@/components/contract-form";
import { createContract, updateContract, updateCustomer } from "@/app/app/actions/customers";
import { formatPhone } from "@/lib/domain/phone";
import { formatXaf } from "@/lib/domain/money";
import { displayStatus, remaining, SERVICE_LABELS } from "@/lib/domain/invoicing";
import { todayIso } from "@/lib/domain/dates";
import type { Contract, Customer, Invoice, Property } from "@/lib/types";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string; ok?: string }> }) {
  const { id } = await params;
  const { erreur, ok } = await searchParams;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("customers").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!data) notFound();
  const c = data as Customer;
  const [{ data: contracts }, { data: invoices }, { data: props }] = await Promise.all([
    ctx.supabase.from("contracts").select("*").eq("customer_id", id).order("active", { ascending: false }).order("created_at"),
    ctx.supabase.from("invoices").select("*").eq("customer_id", id).order("period", { ascending: false }).order("number", { ascending: false }).limit(36),
    ctx.supabase.from("properties").select("*").eq("org_id", ctx.org.id).eq("archived", false).order("name"),
  ]);
  const contractList = (contracts ?? []) as Contract[];
  const invoiceList = (invoices ?? []) as Invoice[];
  const properties = (props ?? []) as Property[];
  const propName = new Map(properties.map((p) => [p.id, p.name]));
  const today = todayIso();
  const due = invoiceList.reduce((s, i) => s + (i.status === "a_payer" ? remaining(i) : 0), 0);

  return (
    <>
      <BackLink href="/app/clients">Clients</BackLink>
      <PageHeader
        title={c.name}
        subtitle={<>{c.phone ? `WhatsApp ${formatPhone(c.phone)}` : "Pas de numéro WhatsApp"} · Reste à payer : <b className={due ? "text-risk" : ""}>{formatXaf(due)}</b></>}
      />
      <Flash erreur={erreur} ok={ok} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="h2">Contrats</h2>
            {contractList.length === 0 && <p className="text-sm text-slate-600">Aucun contrat : ce client ne reçoit pas encore de factures.</p>}
            {contractList.map((k) => (
              <details key={k.id} className="card">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <b>{k.label}</b>
                  <span>{propName.get(k.property_id) ?? "Bien archivé"}{k.unit ? ` · ${k.unit}` : ""}</span>
                  <span className="font-mono">{formatXaf(k.amount_xaf)} / mois, le {k.due_day}</span>
                  {!k.active && <Pill>Terminé</Pill>}
                </summary>
                {ctx.canEdit && <div className="mt-4"><ContractForm action={updateContract} customerId={c.id} properties={properties} contract={k} /></div>}
              </details>
            ))}
            {ctx.canEdit && (
              <details className="card" open={contractList.length === 0}>
                <summary className="cursor-pointer text-sm font-medium">+ Ajouter un contrat (loyer, Wi-Fi…)</summary>
                <div className="mt-4">
                  {properties.length === 0 ? (
                    <p className="text-sm">Créez d&apos;abord un <Link href="/app/biens" className="underline">immeuble ou une zone Wi-Fi</Link>.</p>
                  ) : (
                    <ContractForm action={createContract} customerId={c.id} properties={properties} />
                  )}
                </div>
              </details>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="h2">Factures</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>N°</th><th>Libellé</th><th>Montant</th><th>Échéance</th><th>Statut</th></tr></thead>
                <tbody>
                  {invoiceList.length === 0 && <tr><td colSpan={5} className="text-slate-500">Aucune facture.</td></tr>}
                  {invoiceList.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-xs"><Link href={`/app/factures/${i.id}`} className="hover:underline">{i.number}</Link></td>
                      <td>{i.label}</td>
                      <td className="whitespace-nowrap">{formatXaf(i.amount_xaf)}</td>
                      <td>{formatDate(i.due_on)}</td>
                      <td><StatusPill status={displayStatus(i, today)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {ctx.canEdit && (
          <form action={updateCustomer} className="card flex h-fit flex-col gap-3">
            <h2 className="h2">Coordonnées</h2>
            <input type="hidden" name="id" value={c.id} />
            <Field label="Nom" name="name"><input id="name" name="name" required className="input" defaultValue={c.name} /></Field>
            <Field label="Numéro WhatsApp" name="phone"><input id="phone" name="phone" inputMode="tel" className="input" defaultValue={c.phone ?? ""} /></Field>
            <Field label="E-mail" name="email"><input id="email" name="email" type="email" className="input" defaultValue={c.email ?? ""} /></Field>
            <Field label="Notes" name="notes"><textarea id="notes" name="notes" rows={3} className="input" defaultValue={c.notes ?? ""} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" defaultChecked={c.archived} /> Client archivé</label>
            <SubmitButton>Enregistrer</SubmitButton>
            <p className="text-xs text-slate-500">Services : {[...new Set(contractList.filter((k) => k.active).map((k) => SERVICE_LABELS[k.service]))].join(", ") || "aucun"}</p>
          </form>
        )}
      </div>
    </>
  );
}
