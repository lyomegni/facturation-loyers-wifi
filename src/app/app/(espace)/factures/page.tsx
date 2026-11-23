import Link from "next/link";
import { getContext } from "@/lib/context";
import { EmptyState, Flash, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { issueInvoicesNow } from "@/app/app/actions/invoices";
import { formatXaf } from "@/lib/domain/money";
import { displayStatus, remaining, STATUS_LABELS, type DisplayStatus } from "@/lib/domain/invoicing";
import { addMonths, periodLabel, periodOf, todayIso } from "@/lib/domain/dates";
import type { Invoice, Property } from "@/lib/types";

export const metadata = { title: "Factures" };

type Row = Invoice & { customer: { id: string; name: string } | null };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; ok?: string; statut?: string; mois?: string; bien?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const today = todayIso();
  const period = sp.mois && /^\d{4}-\d{2}$/.test(sp.mois) ? `${sp.mois}-01` : sp.mois === "tous" ? null : periodOf(today);

  let query = ctx.supabase
    .from("invoices")
    .select("*, customer:customers(id, name)")
    .eq("org_id", ctx.org.id)
    .order("due_on", { ascending: false })
    .order("number", { ascending: false })
    .limit(500);
  if (period) query = query.eq("period", period);
  if (sp.bien) query = query.eq("property_id", sp.bien);
  if (sp.statut === "payee" || sp.statut === "annulee") query = query.eq("status", sp.statut);
  if (sp.statut === "a_payer" || sp.statut === "en_retard" || sp.statut === "partielle") query = query.eq("status", "a_payer");
  if (sp.statut === "en_retard") query = query.lt("due_on", today);
  const [{ data }, { data: props }] = await Promise.all([
    query,
    ctx.supabase.from("properties").select("id, name").eq("org_id", ctx.org.id).order("name"),
  ]);
  let rows = (data ?? []) as Row[];
  if (sp.statut === "partielle") rows = rows.filter((r) => displayStatus(r, today) === "partielle");
  const total = rows.reduce((s, r) => s + (r.status === "annulee" ? 0 : r.amount_xaf), 0);
  const left = rows.reduce((s, r) => s + remaining(r), 0);
  const months = Array.from({ length: 13 }, (_, i) => addMonths(periodOf(today), 1 - i));

  return (
    <>
      <PageHeader
        title="Factures"
        subtitle={<>{rows.length} facture(s) · {formatXaf(total)} facturés · <span className={left ? "text-risk" : ""}>{formatXaf(left)} restant dus</span></>}
        actions={ctx.canEdit && (
          <form action={issueInvoicesNow}>
            <SubmitButton pending="Émission…">Émettre les factures dues</SubmitButton>
          </form>
        )}
      />
      <Flash erreur={sp.erreur} ok={sp.ok} />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="mois" defaultValue={period ? period.slice(0, 7) : "tous"} className="input w-auto" aria-label="Mois">
          {months.map((m) => <option key={m} value={m.slice(0, 7)}>{periodLabel(m)}</option>)}
          <option value="tous">Tous les mois</option>
        </select>
        <select name="statut" defaultValue={sp.statut ?? ""} className="input w-auto" aria-label="Statut">
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_LABELS) as DisplayStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select name="bien" defaultValue={sp.bien ?? ""} className="input w-auto" aria-label="Bien">
          <option value="">Tous les biens</option>
          {((props ?? []) as Pick<Property, "id" | "name">[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-secondary" type="submit">Filtrer</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="Aucune facture pour ce filtre">
          Les factures sont émises automatiquement chaque matin, {ctx.org.invoice_lead_days} jour(s) avant l&apos;échéance de chaque contrat.
          Vous pouvez aussi cliquer sur « Émettre les factures dues ».
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>N°</th><th>Client</th><th>Libellé</th><th>Montant</th><th>Reste</th><th>Échéance</th><th>Statut</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs"><Link href={`/app/factures/${r.id}`} className="hover:underline">{r.number}</Link></td>
                  <td>{r.customer ? <Link href={`/app/clients/${r.customer.id}`} className="hover:underline">{r.customer.name}</Link> : "—"}</td>
                  <td>{r.label}</td>
                  <td className="whitespace-nowrap">{formatXaf(r.amount_xaf)}</td>
                  <td className="whitespace-nowrap">{remaining(r) ? formatXaf(remaining(r)) : "—"}</td>
                  <td>{formatDate(r.due_on)}</td>
                  <td><StatusPill status={displayStatus(r, today)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
