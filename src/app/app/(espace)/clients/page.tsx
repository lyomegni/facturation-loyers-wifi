import Link from "next/link";
import { getContext } from "@/lib/context";
import { EmptyState, Field, Flash, PageHeader, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createCustomer } from "@/app/app/actions/customers";
import { formatPhone } from "@/lib/domain/phone";
import { formatXaf } from "@/lib/domain/money";
import { remaining } from "@/lib/domain/invoicing";
import type { Customer, Invoice } from "@/lib/types";

export const metadata = { title: "Clients" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ erreur?: string; q?: string; archives?: string }> }) {
  const { erreur, q, archives } = await searchParams;
  const ctx = await getContext();
  let query = ctx.supabase.from("customers").select("*").eq("org_id", ctx.org.id).order("name");
  if (!archives) query = query.eq("archived", false);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,phone.ilike.%${q.replace(/\D/g, "") || "_"}%`);
  const { data } = await query;
  const customers = (data ?? []) as Customer[];
  const { data: open } = await ctx.supabase.from("invoices").select("customer_id, amount_xaf, paid_xaf, status").eq("org_id", ctx.org.id).eq("status", "a_payer");
  const due = new Map<string, number>();
  ((open ?? []) as Pick<Invoice, "customer_id" | "amount_xaf" | "paid_xaf" | "status">[]).forEach((i) => due.set(i.customer_id, (due.get(i.customer_id) ?? 0) + remaining(i)));

  return (
    <>
      <PageHeader title="Clients" subtitle="Locataires et abonnés Wi-Fi." actions={<Link href="/app/import" className="btn-secondary">Importer depuis Excel</Link>} />
      <Flash erreur={erreur} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Rechercher un nom ou un numéro" className="input" aria-label="Rechercher" />
            <button className="btn-secondary" type="submit">Rechercher</button>
          </form>
          {customers.length === 0 ? (
            <EmptyState title="Aucun client">Ajoutez un client avec le formulaire, ou importez votre liste Excel.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Nom</th><th>WhatsApp</th><th>Reste à payer</th></tr></thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className={c.archived ? "opacity-50" : ""}>
                      <td><Link href={`/app/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
                      <td className="whitespace-nowrap">{c.phone ? formatPhone(c.phone) : <Pill tone="warn">Sans numéro</Pill>}</td>
                      <td className="whitespace-nowrap">{due.get(c.id) ? <span className="text-risk">{formatXaf(due.get(c.id)!)}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link href={archives ? "/app/clients" : "/app/clients?archives=1"} className="text-sm text-slate-600 underline">
            {archives ? "Masquer les clients archivés" : "Afficher les clients archivés"}
          </Link>
        </div>
        {ctx.canEdit && (
          <form action={createCustomer} className="card flex h-fit flex-col gap-3">
            <h2 className="h2">Nouveau client</h2>
            <Field label="Nom" name="name"><input id="name" name="name" required className="input" /></Field>
            <Field label="Numéro WhatsApp" name="phone" hint="Ex. 699 00 00 00 (le +237 est ajouté automatiquement)">
              <input id="phone" name="phone" inputMode="tel" className="input" />
            </Field>
            <Field label="E-mail (facultatif)" name="email"><input id="email" name="email" type="email" className="input" /></Field>
            <Field label="Notes" name="notes"><textarea id="notes" name="notes" rows={2} className="input" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whatsapp_opt_out" /> Ne pas contacter sur WhatsApp</label>
            <SubmitButton>Créer le client</SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
